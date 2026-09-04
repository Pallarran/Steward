const TZ = "America/Toronto";

function words(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The greeting and the date, in the rail.
 *
 * **Moved out of Home's `PageHeader` on 2026-09-04, at Vincent's suggestion**,
 * and it is the better place on two counts. It cost Home 70px of working row —
 * 46px of header plus the 24px band gap — for two lines that change once a day;
 * that height is now queue rows. And what day it is was never Home's fact. It is
 * the same argument that put the clock here on 2026-08-30: on a normal day the
 * rail is the only timestamp on screen.
 *
 * Home is consequently the one page with no `PageHeader`, which is right — it is
 * the surface you land on and does not need to announce itself. Every other page
 * keeps its own title and its own verdict.
 *
 * Rendered on the server with no clock of its own: `AutoRefresh` re-renders the
 * layout every sixty seconds, so the greeting turns over on its own.
 */
export function Greeting() {
  const now = new Date();

  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
  );

  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);

  return (
    <div className="flex flex-col gap-[1px] px-[16px] text-center">
      <span className="text-[15px] font-medium">{words(hour)}</span>
      <span className="text-[13px] text-faint">{date}</span>
    </div>
  );
}
