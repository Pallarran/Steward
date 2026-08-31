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
export const SOURCE_LABEL: Record<SourceKey, string> = {
  ha: "Home Assistant",
  kuma: "Uptime Kuma",
  todoist: "Todoist",
  rss: "News",
  unraid: "Unraid",
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
