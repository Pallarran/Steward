import { prisma } from "@/lib/db/prisma";
import { aiConfigured } from "@/lib/ai";
import {
  fetchBodies,
  gmailConfigured,
  summariseText,
  type MailDetail,
} from "@/lib/adapters/gmail";

/** Enough to judge a message by. It is a read, not an archive of the mail. */
const MAX_EXCERPT = 1200;

/**
 * How many messages one run will summarise.
 *
 * Ten at roughly a second and a half each is a run of well under a minute, and
 * a morning's backlog clears over two or three ticks rather than blocking one.
 * The first message of a cold run pays the model's 27-second load; the rest do
 * not, which is the whole reason this batches at all.
 */
const PER_RUN = 10;

/**
 * Summarises the mail that arrived since the last run.
 *
 * **Not an adapter, deliberately.** It writes no `SourceStatus` and appears on
 * no collector grid, for the same reason `lib/ai.ts` does not: a model that is
 * off is not a fact about the house, and turning the Gmail collector amber
 * because Ollama was busy would report a mail outage that is not happening.
 * Mail collection and mail summarising fail independently, and only the first
 * of them is something Vincent has to know about.
 *
 * **It never re-reads a message it has already handled.** `summarisedAt` is the
 * marker, not `summary`: a message with no readable text — a calendar invite, a
 * bare image — will never summarise, and without a marker it would be fetched
 * again every five minutes for as long as it stayed unread. So a permanent
 * failure is stamped and skipped, while a *transient* one is not stamped at
 * all: if the model is unreachable the run stops where it is and the same
 * messages are picked up next tick.
 *
 * **The model stays loaded exactly when it should.** Ollama's `keep_alive` is
 * fifteen minutes and this runs every five, so a busy morning keeps the model
 * warm and a quiet afternoon lets it unload and gives the 8 GB back. That is
 * the behaviour the fifteen minutes was chosen for, arrived at by accident and
 * worth keeping on purpose.
 */
export async function summarisePendingMail(limit = PER_RUN): Promise<string> {
  if (!gmailConfigured()) return "Gmail is not connected";
  if (!aiConfigured()) return "no local model configured";

  const pending = await prisma.item.findMany({
    where: {
      source: "gmail",
      summarisedAt: null,
      status: { not: "dismissed" },
      // The tail row and the pre-2026-09-02 roll-ups stand for several messages
      // and have no body to read. `messageId` would throw on them.
      externalId: { startsWith: "unread:", not: { in: ["unread:more"] } },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    // `summary` and `detail` come along so a row that already has an answer is
    // not asked for it again — see the model call below.
    select: { id: true, externalId: true, summary: true, detail: true },
  });

  const wanted = pending.filter((p) => !p.externalId.startsWith("unread:rollup:"));
  if (wanted.length === 0) return "nothing waiting";

  const bodies = await fetchBodies(wanted.map((p) => p.externalId));

  let done = 0;
  let empty = 0;

  for (const item of wanted) {
    const body = bodies.get(item.externalId);

    if (!body) {
      // Nothing to read, and there never will be. Stamped so it is not fetched
      // again on every tick for as long as it stays unread.
      await prisma.item.update({ where: { id: item.id }, data: { summarisedAt: new Date() } });
      empty += 1;
      continue;
    }

    // **The model runs only when there is no answer yet.** Rows collected
    // before the links and the excerpt existed are re-processed by nulling
    // their `summarisedAt`, and re-summarising them would cost a model call
    // apiece to arrive at the same words. The body is in hand either way, so
    // the extraction below is free.
    let text = item.summary;

    if (text === null) {
      try {
        text = await summariseText(body.text);
      } catch {
        // The model is unreachable or refused. Nothing is stamped, so these are
        // tried again in five minutes — and the rest of the batch is abandoned,
        // because whatever stopped this one will stop the next nine too.
        return `${done} done, stopped early — the model did not answer`;
      }

      if (text === null) return `${done} done, no model configured`;
    }

    await prisma.item.update({
      where: { id: item.id },
      data: {
        summary: text,
        summarisedAt: new Date(),
        // Merged, not replaced: the collector wrote `fromAddress` here when the
        // row was created, and this must not drop it.
        detail: {
          ...((item.detail ?? {}) as MailDetail),
          links: body.links,
          excerpt: body.text.slice(0, MAX_EXCERPT),
        } satisfies MailDetail,
      },
    });
    done += 1;
  }

  return `${done} summarised${empty > 0 ? `, ${empty} with nothing to read` : ""}`;
}
