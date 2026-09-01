import crypto from "crypto";
import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/db/prisma";
import { PRIORITY } from "@/lib/priority";
import type { Adapter } from "./types";

const HOST = "imap.gmail.com";
const PORT = 993;

/** Generous: Gmail's IMAP is not fast, and this runs on a schedule. */
const TIMEOUT_MS = 30_000;

/**
 * Above this, one row instead of many — the roll-up rule the monitors and the
 * Home Assistant updates already use. Nine unread messages is a fact about the
 * morning; nine rows is a queue nobody reads.
 */
const ROLLUP_AT = 6;

/**
 * Never build more rows than this even before rolling up, and never hold more
 * subjects in memory than a person would read.
 */
const MAX_FETCH = 50;

/**
 * The Gmail search this collects, chosen by Vincent on 2026-09-01.
 *
 * **Gmail's own categories do the filtering**, which is the whole reason this
 * is IMAP against Gmail rather than IMAP against anything: `X-GM-RAW` accepts
 * Gmail's search syntax, so the classifier Vincent already trusts and already
 * trains by using it is the filter, and Steward writes none of its own.
 *
 * Promotions, Social and Forums are dropped: marketing and notifications.
 * **Updates is deliberately kept** — it is where bills, delivery notices and
 * most Pluri Portail mail land, so excluding it would quietly lose the things
 * most worth queueing while looking tidier.
 */
const SEARCH = "is:unread in:inbox -category:promotions -category:social -category:forums";

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

type Message = {
  /** Gmail's own permanent id, stable across folders and renames. */
  id: string;
  uid: number;
  subject: string;
  from: string;
  at: Date;
};

/**
 * Unread mail, as queue rows.
 *
 * **IMAP with an app password, not the Gmail API** — PRD §3.2 component 2, and
 * the reasoning is worth keeping: the API needs a Google Cloud project and an
 * OAuth consent screen, and a self-hosted app left in "testing" gets refresh
 * tokens that expire every seven days. Steward would break weekly and the fix
 * would be a human re-authorising it. An app password has no such trap.
 *
 * **Nothing here reads a message body.** IMAP's ENVELOPE carries sender,
 * subject and date, which is exactly what PRD §3.2 asks a row to show, and
 * fetching bodies would mean Steward held the contents of Vincent's mail in
 * Postgres for no gain.
 */
export const gmail: Adapter = {
  key: "gmail",
  intervalSeconds: 300,

  async run(now) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are not set");

    const messages = await fetchUnread(user, pass);
    const rolled = await writeItems(messages, now);

    return `${messages.length} unread, ${rolled ? "rolled up" : `${messages.length} rows`}`;
  },
};

async function fetchUnread(user: string, pass: string): Promise<Message[]> {
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    // ImapFlow logs every command at info by default, which would put Vincent's
    // subject lines in the container log. Steward has its own logger and this
    // adapter's summary is the only thing worth recording.
    logger: false,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  try {
    await client.connect();
  } catch (err) {
    // Gmail's own wording for a bad app password is "Invalid credentials
    // (Failure)", which says nothing about which of the two is wrong.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      /invalid credentials/i.test(reason)
        ? "Gmail rejected the login — check GMAIL_USER and that the app password has no spaces"
        : `Could not reach ${HOST}: ${reason}`,
    );
  }

  try {
    // Read-only: this collector never changes a flag. Marking as read is a
    // separate, user-initiated write — see `markRead`.
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = await client.search({ gmraw: SEARCH }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Newest first, then capped. Gmail returns uids ascending, and if there
      // are three hundred unread the useful ones are the recent ones.
      const wanted = uids.slice(-MAX_FETCH);

      const messages: Message[] = [];
      // `emailId` is not requested: ImapFlow always includes it when the server
      // advertises X-GM-EXT-1, which Gmail does, and asking for it is a type
      // error rather than a no-op.
      for await (const msg of client.fetch(wanted, { envelope: true, uid: true }, { uid: true })) {
        const sender = msg.envelope?.from?.[0];
        messages.push({
          // `emailId` is Gmail's X-GM-MSGID. Preferred over the IMAP uid
          // because a uid is only unique within one mailbox and changes if the
          // message is moved — which would make the same mail arrive twice.
          id: msg.emailId ?? `uid:${msg.uid}`,
          uid: msg.uid,
          subject: msg.envelope?.subject?.trim() || "(no subject)",
          from: sender?.name?.trim() || sender?.address || "unknown sender",
          at: msg.envelope?.date ?? new Date(),
        });
      }

      return messages.sort((a, b) => b.at.getTime() - a.at.getTime());
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** True when it rolled up. */
async function writeItems(messages: Message[], now: Date): Promise<boolean> {
  const wanted: string[] = [];
  let rolled = false;

  if (messages.length >= ROLLUP_AT) {
    rolled = true;

    // The id is a digest of exactly which messages, so a row for "9 unread"
    // does not silently persist as a row for a different nine.
    const digest = crypto
      .createHash("sha1")
      .update(messages.map((m) => m.id).sort().join(","))
      .digest("hex")
      .slice(0, 12);
    const externalId = `unread:rollup:${digest}`;
    wanted.push(externalId);

    const senders = [...new Set(messages.map((m) => m.from))];

    await upsert({
      externalId,
      title: `${messages.length} unread messages in Gmail`,
      subtitle:
        senders.slice(0, 4).join(", ") +
        (senders.length > 4 ? `, and ${senders.length - 4} more` : ""),
      url: "https://mail.google.com/mail/u/0/#inbox",
      // The oldest, because that is when the backlog started.
      occurredAt: messages[messages.length - 1].at,
      now,
    });
  } else {
    for (const message of messages) {
      const externalId = `unread:${message.id}`;
      wanted.push(externalId);

      await upsert({
        externalId,
        title: message.subject,
        subtitle: message.from,
        url: permalink(message.id),
        occurredAt: message.at,
        now,
      });
    }
  }

  // Built conditionally: an empty `notIn` is not something to bet on.
  await prisma.item.deleteMany({
    where: {
      source: "gmail",
      externalId:
        wanted.length > 0 ? { startsWith: "unread:", notIn: wanted } : { startsWith: "unread:" },
    },
  });

  return rolled;
}

async function upsert(args: {
  externalId: string;
  title: string;
  subtitle: string;
  url: string;
  occurredAt: Date;
  now: Date;
}) {
  await prisma.item.upsert({
    where: { source_externalId: { source: "gmail", externalId: args.externalId } },
    // `status` untouched, like every other collector: a row waved away stays
    // away until the message itself stops being unread, which deletes it.
    update: {
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      priority: PRIORITY.mail,
    },
    create: {
      source: "gmail",
      externalId: args.externalId,
      category: "mail",
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      priority: PRIORITY.mail,
      occurredAt: args.occurredAt,
    },
  });
}

/**
 * A link that opens the message itself.
 *
 * Gmail's web client addresses a message by the **hex** form of X-GM-MSGID,
 * while IMAP hands it over as decimal — the one detail that makes this look
 * broken if missed, because a decimal id produces a URL that loads Gmail and
 * then shows nothing.
 *
 * Falls back to the inbox for the `uid:` ids used when a server does not
 * support the extension: a link to the right place beats a link to nothing.
 */
export function permalink(id: string): string {
  if (!/^\d+$/.test(id)) return "https://mail.google.com/mail/u/0/#inbox";
  return `https://mail.google.com/mail/u/0/#inbox/${BigInt(id).toString(16)}`;
}

/**
 * Marks one message read, which is how a mail row leaves the queue.
 *
 * **Rule 3 is why this exists.** Dismissing an unread mail in Steward would
 * create a private notion of "cleared" that Gmail does not share, and the next
 * collector run would bring the row straight back — the exact drift the rule
 * forbids, and the same reason a Todoist task is ticked rather than dismissed.
 * So a mail row is ticked, the flag is set in Gmail, and the row disappears on
 * the next run because it no longer matches the search.
 */
export function markRead(externalId: string): Promise<void> {
  return setSeen(externalId, true);
}

/** The undo. Symmetrical, so a mis-press costs nothing. */
export function markUnread(externalId: string): Promise<void> {
  return setSeen(externalId, false);
}

async function setSeen(externalId: string, seen: boolean): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Gmail is not connected.");

  const id = externalId.replace(/^unread:/, "");
  if (id.startsWith("rollup:")) {
    throw new Error("That row stands for several messages — open Gmail to clear them.");
  }

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Found by Gmail's own message id rather than a stored uid: a uid is
      // valid only for the mailbox it came from, and the message may have moved
      // between the collector seeing it and this running. ImapFlow maps
      // `emailId` onto X-GM-MSGID, which Gmail supports.
      const found = await client.search({ emailId: id }, { uid: true });
      if (!found || found.length === 0) {
        throw new Error("That message is no longer in the inbox.");
      }

      if (seen) await client.messageFlagsAdd(found, ["\\Seen"], { uid: true });
      else await client.messageFlagsRemove(found, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}
