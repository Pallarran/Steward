import { prisma } from "@/lib/db/prisma";

/**
 * Nightly cleanup.
 *
 * Nothing else in Steward deletes anything. Every adapter upserts, the queue
 * marks rather than removes, and articles arrive hourly forever — so without
 * this the database only grows, and the pages that scan it only get slower.
 *
 * Every window here is deliberately generous. The cost of keeping a row a week
 * too long is nothing; the cost of deleting one a day too early is a headline
 * Vincent had not read yet, or an item that reappears because the adapter no
 * longer recognises it. When in doubt, keep.
 */
const DAYS = {
  /** A read article is gone (rule 3). The week is only for changing your mind. */
  readArticles: 7,
  /** Unread and never promoted. Long enough that a fortnight away loses nothing. */
  staleArticles: 30,
  /** Dismissed queue items. Kept long enough to be looked up, not forever. */
  dismissedItems: 90,
  /**
   * Live-state rows an adapter stopped seeing. Both adapters prune their own on
   * every successful run, so anything this old is a leftover from a source that
   * was down when its row should have gone.
   */
  unseenState: 7,
  /** A monitor deleted in Uptime Kuma. */
  unseenMonitors: 30,
  /**
   * Outage history. The service cards look back thirty days; the rest is
   * headroom for widening that window without having thrown the answer away.
   *
   * Measured from when an outage **ended**, not when it started: a three-month
   * outage still running is the last thing to delete.
   */
  outages: 90,
} as const;

function daysAgo(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

export async function runHousekeeping(now: Date = new Date()): Promise<string> {
  const readCutoff = daysAgo(now, DAYS.readArticles);
  const staleCutoff = daysAgo(now, DAYS.staleArticles);

  const [readArticles, staleArticles, sessions, items, tasks, events, monitors, outages] =
    await Promise.all([
      prisma.article.deleteMany({ where: { readAt: { lt: readCutoff } } }),

      // Unread, but old and never picked by the ranking. Deliberately spares
      // anything promoted: a queue row points at an article by its id, and
      // deleting the article under a live row would leave a link to nothing.
      prisma.article.deleteMany({
        where: { readAt: null, promotedAt: null, publishedAt: { lt: staleCutoff } },
      }),

      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),

      // Activity.itemId is onDelete: SetNull, so clearing old items never
      // costs a point of history.
      prisma.item.deleteMany({
        where: { status: "dismissed", dismissedAt: { lt: daysAgo(now, DAYS.dismissedItems) } },
      }),

      prisma.task.deleteMany({ where: { seenAt: { lt: daysAgo(now, DAYS.unseenState) } } }),
      prisma.calendarEvent.deleteMany({
        where: { seenAt: { lt: daysAgo(now, DAYS.unseenState) } },
      }),
      prisma.monitor.deleteMany({ where: { seenAt: { lt: daysAgo(now, DAYS.unseenMonitors) } } }),

      // `endedAt: { lt: … }` never matches null, so an outage still running is
      // safe here however long it has gone on.
      prisma.monitorOutage.deleteMany({
        where: { endedAt: { lt: daysAgo(now, DAYS.outages) } },
      }),
    ]);

  return (
    `articles ${readArticles.count} read + ${staleArticles.count} stale, ` +
    `${sessions.count} sessions, ${items.count} dismissed items, ` +
    `${tasks.count} tasks, ${events.count} events, ${monitors.count} monitors, ` +
    `${outages.count} outages`
  );
}
