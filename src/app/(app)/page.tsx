import { requireAuth } from "@/lib/auth/require-auth";
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
 * **Three columns since 2026-09-01, and no stat row.** It was a stat row, the
 * gate, then a 1292px queue beside a 340px Today card — 79/21, neither
 * stretching, so a busy queue and a quiet day left up to 897px of empty column.
 * A queue row was 61px tall and 1292px wide to carry about 400px of text.
 *
 * The stat row went because every number on it was already on the same screen:
 * services up is in the gate's own sentence, the queue count is the length of
 * the list beneath it, today's events are the Today card.
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
      <header className="flex flex-col gap-[12px] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">{greeting(hour)}</h1>
          <p className="text-[13px] text-muted-foreground">{date}</p>
        </div>
        <CaptureBox />
      </header>

      <GateCard />

      {/*
        Three columns, and `items-start` is gone so the three cards share a
        bottom edge rather than leaving a ragged one.

        **Today comes first below `lg`.** Stacked, the queue used to render in
        full before it, so on a phone "what is on today" began about 1000px
        down — the unbounded card in front of the bounded, time-critical one.
      */}
      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.1fr_1fr_1fr]">
        <QueueCard className="order-2 lg:order-1" />
        <TodayCard now={now} today={today} className="order-1 lg:order-2" />
        <AheadCard now={now} today={today} className="order-3" />
      </div>
    </>
  );
}
