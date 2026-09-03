/**
 * Turning a choice in the dialog into what Todoist is told.
 *
 * **Imports nothing**, like `lib/priority.ts` and for the same reason: the
 * triage controls are a client component, and anything reaching Prisma or the
 * adapter would drag the server into the browser bundle. Everything here is
 * arithmetic on strings.
 */

/**
 * Tasks in the Home project carry a label per family member — Naomi,
 * Annabelle, Marylene, Vincent — and nothing there is untagged. The Today card
 * is Vincent's, so it shows only his.
 *
 * **This is also what "assign it to me" means on this account.** Todoist's own
 * assignment needs a shared project and a collaborator id, and is not how
 * ownership is recorded here.
 *
 * It lives in this module rather than beside the adapter that filters on it
 * because the triage controls need it as their default, and they run in the
 * browser. The adapter re-exports it so its other readers did not have to move.
 */
export const OWNER_LABEL = "Vincent";

/** The date choices offered when filing a thought. */
export const WHEN = ["today", "tomorrow", "weekend", "week", "none", "pick"] as const;

export type When = (typeof WHEN)[number];

export const WHEN_LABEL: Record<When, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "Saturday",
  week: "In a week",
  none: "No date",
  pick: "On a date…",
};

const DAY_MS = 86_400_000;

/** A calendar day in the house, as `YYYY-MM-DD`. */
function houseDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Toronto",
  }).format(date);
}

/**
 * The date a choice lands on, or null for "no date".
 *
 * **Calendar days in the house, not milliseconds added to an instant.** The
 * same rule `horizonDay` follows in the Todoist adapter: adding 24 hours across
 * a daylight-saving boundary lands an hour early and can name the day before.
 * Everything below steps from noon UTC on today's house date, where a day is
 * exactly a day.
 *
 * `pick` returns null too — the caller supplies its own date, and this has
 * nothing to compute.
 */
export function dueDateFor(when: When, now: Date): string | null {
  if (when === "none" || when === "pick") return null;

  const today = houseDay(now);
  const anchor = new Date(`${today}T12:00:00Z`).getTime();

  if (when === "today") return today;
  if (when === "tomorrow") return houseDay(new Date(anchor + DAY_MS));
  if (when === "week") return houseDay(new Date(anchor + 7 * DAY_MS));

  // The coming Saturday, and never today: choosing "Saturday" *on* a Saturday
  // means the next one. A thought filed for the weekend on the weekend is being
  // put off, not scheduled for four hours' time.
  const dow = new Date(anchor).getUTCDay();
  const ahead = ((6 - dow + 7) % 7) || 7;
  return houseDay(new Date(anchor + ahead * DAY_MS));
}

/**
 * The labels a filed task should end up with.
 *
 * **Merged, never replaced.** A thought captured in the Inbox may already carry
 * a label, and filing it is a decision about who owns it — not an instruction
 * to forget everything else that was said about it. Order is preserved so an
 * undo comparing arrays sees no spurious change, and an already-present label
 * is not added twice.
 */
export function withLabel(existing: string[], label: string | null): string[] {
  if (!label || existing.includes(label)) return existing;
  return [...existing, label];
}
