import { requireAuth } from "@/lib/auth/require-auth";
import { StatBand } from "@/components/home/stat-band";
import { QueueCard } from "@/components/queue/queue-card";
import { LateCard, TodayCard, UpcomingCard } from "@/components/today/today-card";
import { readToday } from "@/lib/today";

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
 * **Band, working row — and no header, from 2026-09-04.** It carried a
 * greeting, the date and the capture field, and cost 70px of working row on
 * every load for two lines that change once a day. The greeting and the date
 * moved to the rail, where what day it is has always belonged; capture moved
 * into the queue's own header, where a captured thought lands as a row directly
 * underneath it. Nothing was left to put in a header, so Home is now the one
 * page without one — which is right for the surface you land on.
 *
 * The gate card went on 2026-09-01: every problem it could render already
 * appeared somewhere else on this page — a down monitor as a priority-0 queue
 * row *and* the services tile, a disabled disk likewise, a stale Kuma as an
 * amber tile — so it was a second telling of things already told. The band took
 * over its job and widened it to every area.
 *
 * The stat row itself — four bordered cards at 76px — went and came back as one
 * line of figures at about 30px, then as tiles.
 */
export default async function HomePage() {
  await requireAuth();

  const now = new Date();

  // Read once here rather than twice in two cards, now that Today and Ahead
  // are two cards over the same data.
  const today = await readToday(now);

  return (
    <>
      <StatBand />

      {/*
        `grow min-h-0` is what makes the page fit: the row takes whatever height
        is left after the header and the band, and hands it to two columns that
        scroll inside themselves.

        **Every height constraint here is `lg:` only.** Below that the row is
        auto-height and `main` scrolls, because a phone cannot be a page that
        fits — squeezing two cards into whatever is left of a 700px screen and
        scrolling them internally would be worse than scrolling the page.

        **Today comes first below `lg`.** Stacked, the whole queue used to
        render before it, so on a phone "what is on today" began about 1000px
        down — the unbounded card in front of the bounded, time-critical one.
      */}
      {/*
        **A container query, not `lg:`.** `docs/DESIGN.md` has warned since
        2026-09-01 that Tailwind's breakpoints measure the viewport while the
        rail sits inside it, so every `lg:` here fired 272px optimistic — and
        304px once the rail went to 256. At exactly 1024px viewport that gave a
        501px queue beside a 251px column, 58px of which is the time gutter.
        720px of *container* is the same intent measured against the thing that
        actually has to hold two columns.
      */}
      <div className="grid grid-cols-1 gap-[16px] @min-[720px]:min-h-0 @min-[720px]:grow @min-[720px]:grid-cols-[1.85fr_1fr]">
        <QueueCard className="order-2 @min-[720px]:order-1" />

        {/* One column, scrolling as a unit — so the three cards share the
            height rather than competing for it.

            **Late first, and absent on a good day.** It was a group inside a
            card called *Ahead* until 2026-09-02, which is the wrong heading for
            the one thing here that has already gone wrong. */}
        <div className="order-1 flex flex-col gap-[16px] @min-[720px]:order-2 @min-[720px]:min-h-0 @min-[720px]:overflow-y-auto">
          <LateCard now={now} today={today} />
          <TodayCard now={now} today={today} />
          <UpcomingCard now={now} today={today} />
        </div>
      </div>
    </>
  );
}
