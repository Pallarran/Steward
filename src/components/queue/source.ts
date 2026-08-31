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
  family: "Couple",
  subscriptions: "Subscriptions",
};
