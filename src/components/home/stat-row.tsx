import { CalendarDays, ListChecks, Server, type LucideIcon } from "lucide-react";
import { listQueue } from "@/lib/queue";
import { readGate } from "@/lib/systems";
import { readToday } from "@/lib/today";
import { duration } from "@/lib/format";

/**
 * The stat row — docs/DESIGN.md, Layout: 38px icon chip, a 20px/700 number and
 * a 12px muted caption, equal widths across.
 *
 * **Three cards, not the mockup's four.** The fourth is the portfolio, which
 * comes from Horizon in v2. An empty fourth card would be a slot advertising
 * something Steward cannot show; three that are all real is the honest layout
 * until it can.
 *
 * Each card carries its own source's staleness rather than the row carrying
 * one: Uptime Kuma failing must not put the calendar count in doubt.
 */
export async function StatRow() {
  const now = new Date();
  const [gate, items, today] = await Promise.all([readGate(now), listQueue(now), readToday(now)]);

  return (
    <div className="flex items-stretch gap-[16px]">
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
