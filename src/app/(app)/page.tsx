import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { StatBand } from "@/components/home/stat-band";
import { QueueCard } from "@/components/queue/queue-card";
import { GateCard } from "@/components/systems/gate-card";
import { AheadCard, TodayCard } from "@/components/today/today-card";
import { CaptureBox } from "@/components/capture/capture-box";
import { readToday } from "@/lib/today";

const TZ = "America/Toronto";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The page he leaves open, and the only one that has to fit a screen.
 *
 * **A page that does not scroll.** The shell is height-bound and `main` is the
 * scroller, so everything here fits between the header and the bottom of the
 * window: the working row takes what is left, and the cards scroll inside
 * themselves. Below `lg` that stops being possible and `main` scrolls normally
 * — a phone cannot be a page that fits, and clipping it would be worse.
 *
 * **Two columns, not three.** It was a 1292px queue beside a 340px card, then
 * briefly three equal columns. Two: the queue, and Today with Ahead stacked in
 * one wider right-hand column that scrolls as a unit.
 *
 * The stat row — four bordered cards at 76px — went and came back as one line
 * of figures at about 30px.
 */
export default async function HomePage() {
  await requireAuth();

  // Rendered in Steward's timezone, not the server's locale defaults, so the
  // greeting matches the house rather than UTC.
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

  // Read once here rather than twice in two cards, now that Today and Ahead
  // are two cards over the same data.
  const today = await readToday(now);

  return (
    <>
      {/* `PageHeader` rather than a copy of its markup, which is what this was
          — so Home's title sat on a different baseline from every other page. */}
      <PageHeader title={greeting(hour)} subtitle={date} action={<CaptureBox />} />

      <StatBand today={today} />

      <GateCard />

      {/*
        `grow min-h-0` is what makes the page fit: the row takes whatever height
        is left after the header, the band and the gate, and hands it to two
        columns that scroll inside themselves.

        **Every height constraint here is `lg:` only.** Below that the row is
        auto-height and `main` scrolls, because a phone cannot be a page that
        fits — squeezing two cards into whatever is left of a 700px screen and
        scrolling them internally would be worse than scrolling the page.

        **Today comes first below `lg`.** Stacked, the whole queue used to
        render before it, so on a phone "what is on today" began about 1000px
        down — the unbounded card in front of the bounded, time-critical one.
      */}
      <div className="grid grid-cols-1 gap-[16px] lg:min-h-0 lg:grow lg:grid-cols-[1.15fr_1fr]">
        <QueueCard className="order-2 lg:order-1" />

        {/* One column, scrolling as a unit — so Today and Ahead share the
            height rather than competing for it. */}
        <div className="order-1 flex flex-col gap-[16px] lg:order-2 lg:min-h-0 lg:overflow-y-auto">
          <TodayCard now={now} today={today} />
          <AheadCard now={now} today={today} />
        </div>
      </div>
    </>
  );
}
