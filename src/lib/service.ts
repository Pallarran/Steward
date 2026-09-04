/**
 * What a service card says about a service.
 *
 * **Imports nothing**, like `lib/priority.ts` and `lib/triage.ts`: everything
 * here is arithmetic over dates and a string at the end of it, and keeping it
 * free of Prisma is what makes the judgement testable without a database.
 *
 * The judgement is the point. A dot already says whether a service is up; the
 * caption has one line to answer the question that actually sends you to Uptime
 * Kuma, which is whether it has been any good lately.
 */

const DAY_MS = 86_400_000;

/** How far back an uptime figure looks. */
export const WINDOW_DAYS = 30;

/**
 * Days of certificate left before the card says something.
 *
 * **Fourteen, not thirty.** Let's Encrypt renews at thirty days remaining, so
 * a certificate under thirty is the normal state of a healthy service and
 * saying so on every card would be noise. Under fourteen means renewal has
 * failed twice, and that is worth interrupting for.
 */
export const CERT_WARN_DAYS = 14;

export type Outage = { startedAt: Date; endedAt: Date | null };

export type OutageStats = {
  /** Outages that overlap the window. */
  count: number;
  /** Time spent down inside the window. */
  downtimeMs: number;
  /** How long Steward has actually been watching, capped at the window. */
  windowMs: number;
};

/**
 * Outages in the window, clipped to it.
 *
 * Three things this has to get right, and each of them is a way to report a
 * number that is confidently wrong:
 *
 * - **The window is what Steward watched**, not thirty days. A service first
 *   seen an hour ago has an hour of history, and a card claiming a month of it
 *   would be inventing the other twenty-nine days.
 * - **An outage straddling the window's start counts only its overlap.** The
 *   whole of a three-day outage that began before the window would make a
 *   service look far worse than it was inside it.
 * - **An open outage counts to now.** It has not ended; leaving it out until it
 *   does would show a service at 100% while it is down.
 */
export function outageStats(outages: Outage[], watchedSince: Date, now: Date): OutageStats {
  const windowMs = Math.max(0, Math.min(WINDOW_DAYS * DAY_MS, now.getTime() - watchedSince.getTime()));
  const from = now.getTime() - windowMs;

  let count = 0;
  let downtimeMs = 0;

  for (const outage of outages) {
    const started = outage.startedAt.getTime();
    const ended = outage.endedAt?.getTime() ?? now.getTime();
    if (ended <= from) continue;

    count += 1;
    downtimeMs += Math.min(ended, now.getTime()) - Math.max(started, from);
  }

  return { count, downtimeMs, windowMs };
}

/**
 * Uptime over the window, as a fraction, or null when there is nothing to
 * divide by.
 *
 * Null on the first poll after a deploy is correct rather than awkward: a
 * service watched for no time has no uptime, and 100% would be a claim.
 */
export function uptimeFraction(stats: OutageStats): number | null {
  if (stats.windowMs <= 0) return null;
  return Math.max(0, 1 - stats.downtimeMs / stats.windowMs);
}

/**
 * "6 days", "14 hours" — how long Steward has been watching, for the card to
 * name its own window.
 *
 * Deliberately not `format.ts`'s `duration`, which takes two dates and speaks
 * about the past ("41 minutes ago"); this speaks about a span.
 */
export function windowLabel(windowMs: number): string {
  const hours = Math.floor(windowMs / 3_600_000);
  if (hours < 1) return "less than an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

/** "1st", "2nd", "3rd", "11th" — for naming which outage this is. */
export function ordinal(n: number): string {
  // 11th, 12th and 13th are the exceptions the last digit alone gets wrong.
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;

  const suffix: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${n}${suffix[n % 10] ?? "th"}`;
}

export type ServiceLine = {
  status: "down" | "up" | "pending" | "maintenance";
  responseMs: number | null;
  certDays: number | null;
  /** How long it has been in its current state, already worded. */
  changedFor: string;
  stats: OutageStats;
};

/**
 * The card's second line.
 *
 * A ladder, because one line cannot hold everything and the order is the whole
 * design:
 *
 * 1. **Down** says how long, and how many times it has happened. A service down
 *    for the third time this month is a different problem from one down for the
 *    first, and the count is the half nothing else on the page carries.
 * 2. **A certificate inside its warning window** takes the line next, because
 *    it is the only thing here that is actionable while the service is still
 *    up: nothing else says a working service is about to stop.
 * 3. **Otherwise the response time and the record.** "No outages in 6 days"
 *    names the window rather than implying a month, and a percentage only
 *    appears once there is something to report.
 */
export function serviceCaption(line: ServiceLine): string {
  if (line.status === "down") {
    const nth = line.stats.count > 1 ? ` · ${ordinal(line.stats.count)} in ${windowLabel(line.stats.windowMs)}` : "";
    return `down ${line.changedFor}${nth}`;
  }

  if (line.status === "pending" || line.status === "maintenance") return line.status;

  const ms = line.responseMs !== null ? `${line.responseMs} ms` : "up";

  if (line.certDays !== null && line.certDays <= CERT_WARN_DAYS) {
    return line.certDays <= 0
      ? `${ms} · certificate has expired`
      : `${ms} · cert expires in ${line.certDays} day${line.certDays === 1 ? "" : "s"}`;
  }

  const uptime = uptimeFraction(line.stats);
  if (uptime === null) return ms;

  if (line.stats.count === 0) return `${ms} · no outages in ${windowLabel(line.stats.windowMs)}`;

  // One decimal, and never rounded up to 100: a service that was down for a
  // minute this month did not have a perfect month, and 100.0% would say it
  // did. `Math.floor` at the tenth is the honest direction to lose precision.
  const percent = (Math.floor(uptime * 1000) / 10).toFixed(1);
  return `${ms} · ${percent}%, ${line.stats.count} outage${line.stats.count === 1 ? "" : "s"}`;
}
