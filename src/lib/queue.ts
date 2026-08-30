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

export function listQueue(now: Date = new Date()) {
  return prisma.item.findMany({
    where: {
      status: { not: ItemStatus.dismissed },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ priority: "asc" }, { occurredAt: "desc" }],
  });
}
