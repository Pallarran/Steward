import { CalendarDays, ListChecks, Server, TrendingUp, type LucideIcon } from "lucide-react";
import { listQueue } from "@/lib/queue";
import { readGate } from "@/lib/systems";
import { readToday } from "@/lib/today";
import { percent, readFinance } from "@/lib/finance";
import { duration } from "@/lib/format";

/**
 * The stat row — docs/DESIGN.md, Layout: 38px icon chip, a 20px/700 number and
 * a 12px muted caption, equal widths across.
 *
 * Four cards, as the mockup drew — the fourth arrived with Horizon. Until it
 * did, the row was three: an empty slot advertising something Steward could not
 * show would have been worse than a shorter row.
 *
 * Each card carries its own source's staleness rather than the row carrying
 * one: Uptime Kuma failing must not put the calendar count in doubt.
 */
export async function StatRow() {
  const now = new Date();
  const [gate, items, today, finance] = await Promise.all([
    readGate(now),
    listQueue(now),
    readToday(now),
    readFinance(now),
  ]);

  return (
    <div className="grid grid-cols-2 gap-[12px] xl:grid-cols-4 xl:gap-[16px]">
      <Stat
        icon={Server}
        accent="var(--teal)"
        chip="var(--chip-teal)"
        value={`${gate.monitorsUp}/${gate.monitorsTotal}`}
        caption="services up"
        stale={gate.stale}
        staleSince={gate.asOf}
        now={now}
      />

      {/*
        The queue is Steward's own table, so it has no collector and cannot go
        stale. Its number is always true, even when every source is down.
      */}
      <Stat
        icon={ListChecks}
        accent="var(--slate)"
        chip="var(--chip-slate)"
        value={String(items.length)}
        caption="in the queue"
        stale={false}
        staleSince={null}
        now={now}
      />

      <Stat
        icon={CalendarDays}
        accent="var(--purple)"
        chip="var(--chip-purple)"
        value={String(today.events.length)}
        caption="events today"
        stale={today.ha.stale}
        staleSince={today.ha.asOf}
        now={now}
      />

      {/*
        The caption is the honest half of this card. On a weekend Horizon is
        answering perfectly and its figures are still Friday's, so the card says
        "portfolio Friday" rather than implying a market that is shut moved
        today. Not connected at all is its own caption again — never a zero.
      */}
      <Stat
        icon={TrendingUp}
        accent="var(--primary)"
        chip="var(--chip-gold)"
        value={finance.summary ? percent(finance.summary.dayChangePercent) : "—"}
        caption={
          !finance.configured
            ? "portfolio, not connected"
            : finance.priceDateIsToday
              ? "portfolio today"
              : "portfolio at last close"
        }
        stale={finance.stale || finance.summary === null}
        staleSince={finance.asOf}
        now={now}
      />
    </div>
  );
}

/**
 * A stale card dims to about 45 percent and replaces its caption with when its
 * source last answered — docs/DESIGN.md, Stale panel. It never shows the old
 * number as though it were current, which is why `value` becomes an em dash
 * rather than the last figure Steward happened to read.
 */
function Stat({
  icon: Icon,
  accent,
  chip,
  value,
  caption,
  stale,
  staleSince,
  now,
}: {
  icon: LucideIcon;
  accent: string;
  chip: string;
  value: string;
  caption: string;
  stale: boolean;
  /** When the source last answered. Null means it never has. */
  staleSince: Date | null;
  now: Date;
}) {
  return (
    <div className="flex grow basis-0 items-center gap-[13px] rounded-[10px] border bg-card px-[16px] py-[14px]">
      <div
        className={`flex size-[38px] shrink-0 items-center justify-center rounded-[10px] ${stale ? "opacity-45" : ""}`}
        style={{ background: chip }}
      >
        <Icon size={18} strokeWidth={1.8} style={{ color: accent }} />
      </div>

      <div className="flex min-w-0 flex-col gap-[1px]">
        {/* The number is replaced, not merely dimmed. A faded but readable
            stale figure is still a stale figure being shown as the answer. */}
        <span className="font-mono text-[20px] font-bold leading-[1.1]">{stale ? "—" : value}</span>
        {stale ? (
          <span className="truncate text-[12px] text-warning">
            {staleSince
              ? `${caption} — stale, ${duration(staleSince, now)} old`
              : `${caption} — never collected`}
          </span>
        ) : (
          <span className="truncate text-[12px] text-muted-foreground">{caption}</span>
        )}
      </div>
    </div>
  );
}
