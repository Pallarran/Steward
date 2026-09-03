import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ItemStatus } from "@/generated/prisma/enums";
import { writeFact } from "@/lib/facts";
import { PRIORITY } from "@/lib/priority";
import { generate } from "@/lib/ai";
import type { Adapter } from "./types";

const HOST = "imap.gmail.com";
const PORT = 993;

/** Generous: Gmail's IMAP is not fast, and this runs on a schedule. */
const TIMEOUT_MS = 30_000;

/**
 * The most individual rows this will write, and the most subjects it will hold
 * in memory.
 *
 * **Mail does not roll up.** It did until 2026-09-02 — six or more unread
 * became one row, the same rule the monitors and the Home Assistant updates
 * use. Vincent asked for it removed, and he is right: that rule is for *many
 * rows, one event*, and five services down really is one outage. Six unread
 * messages are six unrelated decisions, and a single row saying "6 unread"
 * tells him nothing he did not already know from Gmail's own badge.
 *
 * Past this cap the newest fifty arrive and the rest are named in one tail row
 * rather than vanishing — see `writeItems`. In ordinary use he never sees it.
 */
const MAX_FETCH = 50;

/** The one row that is not a message: the tail, when the cap bites. */
const MORE_ID = "unread:more";

/**
 * The whole inbox. **No category filter, since 2026-09-02.**
 *
 * It excluded Promotions, Social and Forums for a day, and Vincent's words on
 * finding one of two unread messages missing were that he never made that
 * decision and wants to see everything in his inbox. He is substantially right:
 * he picked it from a menu where I had written it as the recommended option and
 * put what it *drops* in the description rather than the label. A choice
 * accepted is not a choice made, and the burden was mine.
 *
 * `X-GM-RAW` is still what makes this IMAP-against-Gmail rather than IMAP
 * against anything — it takes Gmail's own search syntax — but it is now used to
 * say "the inbox" and nothing more. **Steward applies no filter of its own and
 * should not grow one**: what belongs in the inbox is a decision Vincent makes
 * in Gmail, where he can see the result.
 *
 * The cost is volume: every unread promotion is now a queue row, capped at
 * `MAX_FETCH` with a tail row past it. If that turns out to be too much, the
 * lever is here and it is one line.
 */
const SEARCH = "is:unread in:inbox";

/** The backlog: read, and still sitting in the inbox. The same inbox, so the
 * two numbers describe one place. */
const READ_SEARCH = "is:read in:inbox";

export const GMAIL_INBOX = "gmail:inbox";

/** Counts only — no subject, no sender, nothing that says what any of it is. */
export type InboxFact = { unread: number; read: number };

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

type Message = {
  /** Gmail's own permanent id, stable across folders and renames. */
  id: string;
  uid: number;
  subject: string;
  /** The display name where there is one, else the address. What the row shows. */
  from: string;
  /** The address itself, for the detail dialog. Null when the envelope had none. */
  fromAddress: string | null;
  at: Date;
};

/**
 * What goes in `Item.detail` for a mail row.
 *
 * Gmail is one of only two sources with nothing to join back to — Steward
 * stores no mail anywhere — so the little the dialog needs beyond the row has
 * to travel on the item itself. **The address only.** A display name of
 * "Pluri Portail" and an address of `noreply@pluriportail.com` are different
 * facts, and the second is the one that says whether a thing can be replied to.
 */
export type MailDetail = { fromAddress: string | null };

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

    const { messages, total, read } = await fetchUnread(user, pass);
    await writeItems(messages, total, now);

    // A fact rather than queue rows: the read backlog is current state that
    // resolves when Vincent files it, not a list of things that arrived.
    await writeFact(GMAIL_INBOX, "gmail", { unread: total, read } satisfies InboxFact, now);

    const n = messages.length;
    const rows = `${n} ${n === 1 ? "row" : "rows"}`;
    return `${total} unread (${rows}${total > n ? " and a tail" : ""}), ${read} read in inbox`;
  },
};

async function fetchUnread(
  user: string,
  pass: string,
): Promise<{ messages: Message[]; total: number; read: number }> {
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
    throw loginError(err);
  }

  try {
    // Read-only: this collector never changes a flag. Marking as read is a
    // separate, user-initiated write — see `markRead`.
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      // Two searches, one session. A search returns uids and fetches nothing,
      // so the second costs a round trip rather than a download.
      const [uids, readUids] = await Promise.all([
        client.search({ gmraw: SEARCH }, { uid: true }),
        client.search({ gmraw: READ_SEARCH }, { uid: true }),
      ]);
      const read = readUids ? readUids.length : 0;

      if (!uids || uids.length === 0) return { messages: [], total: 0, read };

      // Newest first, then capped. Gmail returns uids ascending, and if there
      // are three hundred unread the useful ones are the recent ones. `total`
      // travels alongside so the tail row can say how many were left behind
      // rather than letting them disappear.
      const total = uids.length;
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
          fromAddress: sender?.address?.trim() || null,
          at: msg.envelope?.date ?? new Date(),
        });
      }

      return { messages: messages.sort((a, b) => b.at.getTime() - a.at.getTime()), total, read };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Says what actually went wrong, which ImapFlow does not.
 *
 * **`err.message` for a refused login is the string "Command failed".** That is
 * the same class of failure `lib/adapters/http.ts` exists to prevent — rule 2
 * says a collector that fails must *name* what went wrong, and the first
 * version of this adapter shipped "Could not reach imap.gmail.com: Command
 * failed" for a bad app password, which points at the network and is wrong.
 *
 * The real answer is on the error object rather than in its message:
 * `authenticationFailed` is set by ImapFlow's own `AuthenticationFailure`, and
 * `serverResponseCode` carries Gmail's code — `AUTHENTICATIONFAILED` for a bad
 * password, `ALERT` when Google wants something done in the account first.
 */
function loginError(err: unknown): Error {
  const e = err as { authenticationFailed?: boolean; serverResponseCode?: string } | null;
  const message = err instanceof Error ? err.message : String(err);

  if (e?.authenticationFailed || /invalid credentials|authenticationfailed/i.test(message)) {
    return new Error(
      "Gmail rejected the login. Check GMAIL_USER, that GMAIL_APP_PASSWORD is an app " +
        "password with its spaces stripped rather than the account password, and that IMAP " +
        "is enabled in Gmail settings.",
    );
  }

  const code = e?.serverResponseCode ? ` (${e.serverResponseCode})` : "";
  return new Error(`Could not reach ${HOST}: ${message}${code}`);
}

/**
 * One row per message, and one more when the cap bit.
 *
 * `total` is how many matched the search, which is larger than `messages.length`
 * only past `MAX_FETCH`.
 */
async function writeItems(messages: Message[], total: number, now: Date): Promise<void> {
  const wanted: string[] = [];

  for (const message of messages) {
    const externalId = `unread:${message.id}`;
    wanted.push(externalId);

    await upsert({
      externalId,
      title: message.subject,
      subtitle: message.from,
      url: permalink(message.id),
      detail: { fromAddress: message.fromAddress } satisfies MailDetail,
      occurredAt: message.at,
      now,
    });
  }

  // The tail. Not a roll-up in disguise: it stands for the messages this
  // collector deliberately did not fetch, and without it they would exist in
  // Gmail and be rendered nowhere at all — which is the failure rule 2 is
  // about, one level down. It keeps the X, having no single flag to set.
  const left = total - messages.length;
  if (left > 0) {
    wanted.push(MORE_ID);
    await upsert({
      externalId: MORE_ID,
      title: `and ${left} older unread ${left === 1 ? "message" : "messages"}`,
      subtitle: `Steward shows the newest ${MAX_FETCH}`,
      url: "https://mail.google.com/mail/u/0/#inbox",
      detail: null,
      // The row is about a backlog rather than an event, so it dates from this
      // run: `occurredAt` is create-only, so it stamps when the cap first bit.
      occurredAt: now,
      now,
    });
  }

  // Built conditionally: an empty `notIn` is not something to bet on. This is
  // also what removes the roll-up rows written before 2026-09-02 — their ids
  // start `unread:` and are in no `wanted` list any more.
  await prisma.item.deleteMany({
    where: {
      source: "gmail",
      externalId:
        wanted.length > 0 ? { startsWith: "unread:", notIn: wanted } : { startsWith: "unread:" },
    },
  });
}

async function upsert(args: {
  externalId: string;
  title: string;
  subtitle: string;
  url: string;
  detail: MailDetail | null;
  occurredAt: Date;
  now: Date;
}) {
  // `null` and "leave it alone" are the same value in a Prisma update, so an
  // explicit JsonNull is needed to clear the column rather than skip it. The
  // tail row is the only writer that passes null, and it must not inherit a
  // sender address from whatever row previously held that id.
  const detail = args.detail ?? Prisma.JsonNull;

  /**
   * **Unlike every other collector, this one resets `status`** — and the
   * exception is rule 3 rather than a break from it.
   *
   * Every row written here is a message that is unread *right now*, and Gmail
   * is authoritative about that. Ticking a mail in Steward marks it read in
   * Gmail and dismisses the row locally; if the message is then marked unread
   * again in Gmail, it still matches `is:unread`, so the row is neither deleted
   * nor re-created — it just sits dismissed for ever, invisible, with no way
   * back. That is exactly the private notion of "cleared" that rule 3 forbids,
   * arrived at from the other direction.
   *
   * **The tail row is excluded**, because it stands for messages rather than
   * being one: waving it away should not undo itself every five minutes.
   */
  const status =
    args.externalId === MORE_ID ? {} : { status: ItemStatus.new, dismissedAt: null };

  await prisma.item.upsert({
    where: { source_externalId: { source: "gmail", externalId: args.externalId } },
    update: {
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      detail,
      priority: PRIORITY.mail,
      ...status,
    },
    create: {
      source: "gmail",
      externalId: args.externalId,
      category: "mail",
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      detail,
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

/**
 * The Gmail message id an item's `externalId` stands for.
 *
 * **Two rows have none**: the tail row, which stands for messages this
 * collector chose not to fetch, and — until they age out — the roll-up rows
 * written before 2026-09-02. Both are told apart here rather than at each call
 * site, so no caller can forget one of them.
 */
export function messageId(externalId: string): string {
  const id = externalId.replace(/^unread:/, "");
  if (id === "more" || id.startsWith("rollup:")) {
    throw new Error("That row stands for several messages — open Gmail to work through them.");
  }
  return id;
}

/** Beyond this the model gets slower without getting better at three lines. */
const MAX_BODY_CHARS = 16_000;

/**
 * How much the model may write back, and the backstop under it.
 *
 * **The prompt asks for three short lines and a long email got a wall** that
 * overflowed the dialog off the screen. A prompt is a request; `num_predict` is
 * a limit, and it bounds the time as well as the length — two hundred tokens
 * cannot take a minute however long the message is.
 *
 * The character cap is the belt under the braces: a model that ignores the
 * instruction entirely still cannot fill a screen. It should never fire, and if
 * it does the summary is cut with an ellipsis rather than silently truncated.
 */
const MAX_SUMMARY_TOKENS = 200;
const MAX_SUMMARY_CHARS = 700;

const SUMMARY_SYSTEM =
  "You summarise one email for a personal dashboard. Reply with at most three short " +
  "plain-text lines: what it is about, anything the reader must do, and by when if a date " +
  "is given. If nothing is being asked of the reader, say so in one line. No markdown, no " +
  "greeting, no preamble, no speculation beyond what the message says.";

/**
 * Reads one message and hands it to the local model.
 *
 * **Nothing is stored.** The body is fetched, summarised and dropped; the
 * summary lives in the dialog that asked for it. That keeps the property the
 * collector was built around — no mail contents in Postgres — and it is exactly
 * where PRD §4 *Privacy* puts personal data: handled locally by Ollama, never
 * leaving the house.
 *
 * **The mailbox is opened read-only, and that is load-bearing**: fetching a body
 * from a read-write mailbox sets `\Seen`, so summarising a message would
 * silently mark it read and delete its own queue row on the next poll.
 *
 * Returns null when no model is configured, which the caller renders as "not
 * connected" rather than as an empty summary — the same contract as `generate`.
 */
export async function summariseMessage(externalId: string): Promise<string | null> {
  const bodies = await fetchBodies([externalId]);
  const body = bodies.get(externalId);
  if (!body) throw new Error("That message has no readable text to summarise.");

  return summariseText(body);
}

/**
 * One body into a few lines, with both caps applied.
 *
 * Shared by the button and the job so the prompt and the limits cannot drift
 * between "the summary Vincent asked for" and "the summary that was waiting
 * for him".
 */
export async function summariseText(body: string): Promise<string | null> {
  const text = await generate(body, SUMMARY_SYSTEM, { maxTokens: MAX_SUMMARY_TOKENS });
  if (text === null) return null;

  return text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS).trimEnd()}…` : text;
}

/**
 * The readable text of several messages, over **one** connection.
 *
 * Keyed by `externalId`, and a message with no readable text simply has no
 * entry — the caller decides whether that is worth an error or a shrug.
 *
 * **One connection, not one per message.** The batch job summarises up to ten
 * at a time, and a login apiece would be ten TLS handshakes and ten
 * authentications to read ten short messages.
 *
 * **Read-only, which is load-bearing**: fetching a body from a read-write
 * mailbox sets `\Seen`, so reading a message here would mark it read and delete
 * its own queue row on the next poll. That is true of the automatic job in a
 * way it never was of the button — it would quietly empty the queue.
 */
export async function fetchBodies(externalIds: string[]): Promise<Map<string, string>> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Gmail is not connected.");
  if (externalIds.length === 0) return new Map();

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  try {
    await client.connect();
  } catch (err) {
    throw loginError(err);
  }

  const bodies = new Map<string, string>();

  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      for (const externalId of externalIds) {
        const id = messageId(externalId);

        const found = await client.search({ emailId: id }, { uid: true });
        // Gone from the inbox between the collector seeing it and this running.
        // One missing message must not cost the other nine their summaries.
        if (!found || found.length === 0) continue;

        const uid = String(found[0]);
        const message = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
        if (!message || !message.bodyStructure) continue;

        const node = textNode(message.bodyStructure);
        if (!node) continue;

        // `part` is undefined on a message that is not multipart; "1" is its body.
        const part = await client.download(uid, node.part ?? "1", {
          uid: true,
          maxBytes: MAX_BODY_CHARS * 2,
        });

        const chunks: Buffer[] = [];
        for await (const chunk of part.content) chunks.push(Buffer.from(chunk));
        const text = clean(Buffer.concat(chunks).toString("utf8"), node.type === "text/html");

        if (text) bodies.set(externalId, text);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return bodies;
}

/**
 * The first readable text part, depth first.
 *
 * Plain text is preferred over HTML wherever both exist, which for a
 * `multipart/alternative` is always — and the plain half is both smaller and
 * already free of the markup the model would otherwise have to see past.
 * Attachments are skipped: a PDF's filename is not the message.
 */
function textNode(node: MessageStructure): MessageStructure | null {
  const wanted = (type: string) => (n: MessageStructure): MessageStructure | null => {
    if (n.disposition === "attachment") return null;
    if (n.type === type) return n;
    for (const child of n.childNodes ?? []) {
      const hit = wanted(type)(child);
      if (hit) return hit;
    }
    return null;
  };

  return wanted("text/plain")(node) ?? wanted("text/html")(node);
}

type MessageStructure = {
  part?: string;
  type: string;
  disposition?: string;
  childNodes?: MessageStructure[];
};

/**
 * Enough tidying that the model spends its context on the message.
 *
 * Quoted history goes: a reply thread repeats itself downwards, and the model
 * summarising the whole chain would answer a question nobody asked. So would a
 * signature block, but those have no reliable marker and are left alone.
 */
function clean(raw: string, html: boolean): string {
  let text = raw;

  if (html) {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"');
  }

  text = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.slice(0, MAX_BODY_CHARS);
}

async function setSeen(externalId: string, seen: boolean): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Gmail is not connected.");

  const id = messageId(externalId);

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  try {
    await client.connect();
  } catch (err) {
    throw loginError(err);
  }

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
