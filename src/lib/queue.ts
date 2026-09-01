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
export type QueueItem = Awaited<ReturnType<typeof listQueue>>["items"][number];

/**
 * How many rows the card shows.
 *
 * **Twelve, because that is what fits.** A queue row is 61px and they sit 63px
 * apart; the first one starts about 230px down a 940px window, so twelve is the
 * last one above the fold. Until 2026-09-01 there was no limit at all, which
 * meant Home's fold position was not a design decision but whatever the
 * collectors happened to produce that morning — the page scrolled or it did not
 * depending on the day.
 *
 * The rest are not hidden: `more` is rendered beside the heading, in the
 * convention News already uses for a truncated list.
 */
const SHOWN = 12;

export async function listQueue(now: Date = new Date()) {
  const where = {
    status: { not: ItemStatus.dismissed },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: [{ priority: "asc" }, { occurredAt: "desc" }],
      take: SHOWN,
    }),
    prisma.item.count({ where }),
  ]);

  return { items, total, more: Math.max(0, total - items.length) };
}
