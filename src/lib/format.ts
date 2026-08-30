const TZ = "America/Toronto";

/** Times are shown in the house's timezone, not the server's locale default. */
export function clock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(date);
}

/**
 * "41 minutes", "3 hours", "2 days" — the duration in the largest unit that
 * still reads honestly. Used for "down for …" and for naming how long a
 * collector has been stale, which rule 2 requires panels to say in words.
 */
export function duration(fromDate: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - fromDate.getTime()) / 1000));

  if (seconds < 60) return "less than a minute";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
