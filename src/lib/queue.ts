import { prisma } from "@/lib/db/prisma";
import { ItemStatus } from "@/generated/prisma/enums";

/**
 * The queue: one prioritized list, no tiers.
 *
 * Live means not dismissed and not past `expiresAt`. Expiry hides an item
 * without anyone dismissing it, which is how news falls out after ~48h.
 *
 * Ordered by `priority` ascending — 0 at the top — then newest first within a
 * priority. Position carries the priority, so nothing renders the number.
 */
export type QueueItem = Awaited<ReturnType<typeof listQueue>>[number];

/**
 * Every live item, in order.
 *
 * **No limit.** There was a `take` of 12 for a few hours on 2026-09-01, added
 * because Home scrolled and the fold landed wherever the collectors happened to
 * leave it. The card scrolls internally now, so capping the query would hide
 * rows for no reason — the list is as long as it is and you can reach the end
 * of it.
 */
export function listQueue(now: Date = new Date()) {
  return prisma.item.findMany({
    // **The summary never travels with the queue.** For a mail row it is the
    // one trace of a message body Steward holds, and shipping it to the browser
    // for every row on Home — including the ones nobody opens — would put the
    // gist of the morning's mail in a page payload to buy nothing. The detail
    // dialog fetches it, on the call it already makes when it opens.
    omit: { summary: true },
    where: {
      status: { not: ItemStatus.dismissed },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ priority: "asc" }, { occurredAt: "desc" }],
  });
}
