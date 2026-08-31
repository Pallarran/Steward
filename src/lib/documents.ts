import { prisma } from "@/lib/db/prisma";
import type { SubscriptionCadence } from "@/generated/prisma/enums";

export type SubscriptionRow = Awaited<ReturnType<typeof prisma.subscription.findMany>>[number];
export type CheatSheetRow = Awaited<ReturnType<typeof prisma.cheatSheetEntry.findMany>>[number];

export type SubscriptionView = SubscriptionRow & {
  /** The next renewal on or after today. Derived, never stored. */
  next: Date;
  /** Whole days until it renews. Zero means today. */
  daysAway: number;
  /** Inside its own notice window. False when it has none. */
  soon: boolean;
};

export type CheatSheetArea = { area: string; entries: CheatSheetRow[] };

export type Documents = {
  subscriptions: SubscriptionView[];
  /** Active only, normalised to one month. The number nobody has. */
  monthlyCents: number;
  cheatSheet: CheatSheetArea[];
};

const DAY_MS = 86_400_000;

/** Calendar day in the house's timezone, as `YYYY-MM-DD`. */
function houseDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Toronto",
  }).format(date);
}

/**
 * The next renewal on or after today.
 *
 * `renewsOn` is *a* renewal date, not necessarily the next one, and this rolls
 * it forward by the cadence until it is no longer past. **Nothing stores the
 * result**: no job has to run to keep it right, it cannot drift, and it is
 * correct again the moment Steward comes back from a month off. The same
 * reasoning that makes the level derived rather than stored.
 *
 * Dates are compared as calendar days, not instants. A renewal is a day in the
 * house, not a moment in UTC, and comparing instants would make a subscription
 * renew a day early every winter.
 */
export function nextRenewal(
  from: Date,
  cadence: SubscriptionCadence,
  now: Date = new Date(),
): Date {
  const today = houseDay(now);
  // Noon UTC, so every step below is exact arithmetic on a calendar that has no
  // daylight saving in it.
  const anchor = new Date(`${houseDay(from)}T12:00:00Z`);
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();

  if (cadence === "weekly") {
    // Weeks are uniform, so this is arithmetic rather than a loop.
    if (anchor.getTime() >= todayMs) return anchor;
    const weeks = Math.ceil((todayMs - anchor.getTime()) / (7 * DAY_MS));
    return new Date(anchor.getTime() + weeks * 7 * DAY_MS);
  }

  const step = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12;

  // **Every candidate is measured from the anchor, never from the last one.**
  // Stepping a date forward month by month loses the end of the month for
  // good: 31 October plus a month overflows into 1 December, and from then on
  // the subscription renews on the 1st forever. Counting from the anchor and
  // clamping to the month's length gives what a card actually does — 31 Jan,
  // 28 Feb, 31 Mar — because the 31st is recovered rather than forgotten.
  const day = anchor.getUTCDate();
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();

  // A guard, not a limit. Monthly since 1970 is under 700 steps; past this is
  // a date nobody meant to type, and a wrong answer beats a loop that hangs.
  for (let n = 0; n < 2000; n++) {
    const target = month + n * step;
    // Day 0 of the following month is the last day of this one.
    const lastDay = new Date(Date.UTC(year, target + 1, 0)).getUTCDate();
    const candidate = new Date(Date.UTC(year, target, Math.min(day, lastDay), 12));
    if (houseDay(candidate) >= today) return candidate;
  }

  return anchor;
}

/**
 * What a subscription costs per month.
 *
 * Weekly is 52/12 rather than 4, because there are not four weeks in a month
 * and the error compounds across a list. Rounded once, at the end.
 */
export function monthlyEquivalentCents(sub: {
  amountCents: number;
  cadence: SubscriptionCadence;
}): number {
  switch (sub.cadence) {
    case "weekly":
      return Math.round((sub.amountCents * 52) / 12);
    case "monthly":
      return sub.amountCents;
    case "quarterly":
      return Math.round(sub.amountCents / 3);
    case "yearly":
      return Math.round(sub.amountCents / 12);
  }
}

export const CADENCE_LABEL: Record<SubscriptionCadence, string> = {
  weekly: "a week",
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
};

export async function readDocuments(now: Date = new Date()): Promise<Documents> {
  const [subs, entries] = await Promise.all([
    prisma.subscription.findMany({ orderBy: { name: "asc" } }),
    prisma.cheatSheetEntry.findMany({ orderBy: [{ position: "asc" }, { label: "asc" }] }),
  ]);

  const todayMs = new Date(`${houseDay(now)}T12:00:00Z`).getTime();

  const subscriptions: SubscriptionView[] = subs
    .map((sub) => {
      const next = nextRenewal(sub.renewsOn, sub.cadence, now);
      const daysAway = Math.round((next.getTime() - todayMs) / DAY_MS);

      return {
        ...sub,
        next,
        daysAway,
        soon: sub.active && sub.noticeDays !== null && daysAway <= sub.noticeDays,
      };
    })
    // Soonest first, and cancelled ones last regardless of when they would
    // have renewed.
    .sort((a, b) =>
      a.active === b.active ? a.daysAway - b.daysAway : Number(b.active) - Number(a.active),
    );

  const cheatSheet: CheatSheetArea[] = [];
  for (const entry of entries) {
    const area = entry.area.trim() || "Other";
    let group = cheatSheet.find((g) => g.area === area);
    if (!group) {
      group = { area, entries: [] };
      cheatSheet.push(group);
    }
    group.entries.push(entry);
  }

  return {
    subscriptions,
    monthlyCents: subscriptions
      .filter((s) => s.active)
      .reduce((total, s) => total + monthlyEquivalentCents(s), 0),
    cheatSheet,
  };
}

/**
 * The queue half: one row when a renewal is inside its notice window.
 *
 * The same shape as the people and family nudges — upsert what is wanted,
 * delete everything else for this source, leave `status` alone so a row waved
 * away stays away.
 *
 * **The external id carries the renewal date**, so dismissing this month's
 * notice does not also silence next month's: the next cycle is a different id
 * and therefore a fresh row. The Home Assistant update rows use the same trick
 * with their version number.
 */
export async function syncSubscriptionNudges(now: Date = new Date()): Promise<string> {
  const { subscriptions } = await readDocuments(now);
  const due = subscriptions.filter((s) => s.soon);

  const wanted: string[] = [];

  for (const sub of due) {
    const externalId = `renewal:${sub.id}:${sub.next.toISOString().slice(0, 10)}`;
    wanted.push(externalId);

    const when =
      sub.daysAway <= 0
        ? "renews today"
        : `renews in ${sub.daysAway} ${sub.daysAway === 1 ? "day" : "days"}`;

    await prisma.item.upsert({
      where: { source_externalId: { source: "subscriptions", externalId } },
      update: { title: `${sub.name} ${when}`, subtitle: subtitle(sub) },
      create: {
        source: "subscriptions",
        externalId,
        category: "subscriptions",
        title: `${sub.name} ${when}`,
        subtitle: subtitle(sub),
        // Straight to the cancel page where there is one: the row exists so a
        // subscription can be stopped before it takes the money.
        url: sub.cancelUrl ?? "/documents",
        // Real money and time-bound, so above the family and people
        // invitations — but this is not the house being broken.
        priority: 30,
        occurredAt: now,
      },
    });
  }

  const removed = await prisma.item.deleteMany({
    where: {
      source: "subscriptions",
      ...(wanted.length > 0 ? { externalId: { notIn: wanted } } : {}),
    },
  });

  return `${subscriptions.length} subscriptions, ${due.length} due, ${removed.count} cleared`;
}

function subtitle(sub: SubscriptionView): string {
  const parts = [
    sub.cancelUrl ? "cancel link attached" : `${(sub.amountCents / 100).toFixed(2)} ${sub.currency}`,
  ];
  if (sub.card) parts.push(sub.card);
  return parts.join(" · ");
}
