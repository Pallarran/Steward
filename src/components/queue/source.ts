import type { SourceKey } from "@/generated/prisma/enums";

/**
 * What a queue row's second line leads with.
 *
 * Changed 2026-08-30 from the category's name to the source's. In a queue
 * mixing four sources, where a row came from tells you more than repeating the
 * category the coloured chip already carries — and it stopped Todoist's Inbox
 * rows reading "Inbox · Inbox".
 *
 * `rss` is labelled News rather than RSS on purpose: the transport is Steward's
 * business, not Vincent's.
 */
/**
 * The Steward page a row belongs to, where one exists.
 *
 * **A row has up to two ways out and they are different journeys.** `Item.url`
 * goes to the app the thing actually lives in — Gmail, Todoist, Uptime Kuma's
 * dashboard, a cancel page. This goes to the page in Steward that shows the
 * same thing in context, which for a renewal means the whole subscription list
 * and for a monitor means the rest of the house. Before this, a subscription
 * with a cancel link could not offer Finance and one without it could not offer
 * the cancel page: `url` held one or the other.
 *
 * `todoist` and `gmail` are absent on purpose. There is no Steward page for
 * either — the queue row *is* Steward's view of them.
 *
 * This file stays importable from a client component, so nothing here may reach
 * for Prisma. It imports one type and nothing else, and must keep doing so.
 */
export const SOURCE_HOME: Partial<Record<SourceKey, string>> = {
  kuma: "/systems",
  unraid: "/systems",
  server: "/systems",
  ha: "/systems",
  horizon: "/finance",
  subscriptions: "/finance",
  people: "/people",
  family: "/people",
  rss: "/news",
};

export const SOURCE_LABEL: Record<SourceKey, string> = {
  ha: "Home Assistant",
  kuma: "Uptime Kuma",
  todoist: "Todoist",
  rss: "News",
  unraid: "Unraid",
  server: "Server",
  horizon: "Horizon",
  vault: "Vault",
  gmail: "Gmail",
  capture: "Captured",
  people: "People",
  // Retired 2026-08-31 when Family merged into People; every nudge that page
  // produces is `people` now. Kept because a Postgres enum cannot drop a value
  // without a type rewrite, and because it labelled rows that still exist until
  // the next sync clears them. It read "Couple", which was right when only
  // couple months used it and wrong from the day the girls joined.
  family: "Family",
  subscriptions: "Subscriptions",
};
