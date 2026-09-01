import { Repeat, Users } from "lucide-react";
import { TickBox } from "./tick-box";
import { clock, duration } from "@/lib/format";
import type { Source, Today, TodayTask } from "@/lib/today";
import { todayInHouse } from "@/lib/adapters/todoist";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";

/** "Marylene", "Marylene and Naomi", "Marylene, Naomi and Annabelle". */
const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "America/Toronto" });

/**
 * Today: everything time-bound today, whatever its source.
 *
 * 340px fixed beside the queue — docs/DESIGN.md, Layout.
 *
 * **Four groups, and nothing outside them.** It shipped as one date-ordered
 * task list with a "late" tag per row, which buried the most actionable thing
 * on the card inside the least: *late* has already gone wrong, *due today* is
 * the commitment, *upcoming* is what lands next. Different questions, different
 * headings, different weights.
 *
 * The first attempt at those four left supper, the bins and tomorrow's school
 * day in a fifth block underneath — four sections plus the things that had
 * nowhere to go. **Every fact now sits in the section for the day it happens**:
 * supper and tonight's bins belong to today's schedule, tomorrow's school day
 * to what is coming. Four headings, no footer.
 *
 * Staleness is per source, not per card. Todoist failing must not make the
 * calendar look wrong, so each half dims and dates itself and says which one
 * is out of date rather than discrediting both.
 */
export function TodayCard({
  now,
  today: data,
  className = "",
}: {
  now: Date;
  today: Today;
  className?: string;
}) {
  const today = todayInHouse(now);
  const { dueToday, events, meal, waste, todoist, ha } = data;

  /**
   * Which section the bins belong to: the day they go out.
   *
   * `imminent` is exactly this question and `today.ts` already answers it —
   * tonight counts as today, because the bin goes to the kerb this evening for
   * a morning collection. Recomputing that rule here would be a second copy of
   * it, free to drift.
   */
  const binsTonight = Boolean(waste?.imminent);

  const nothingAtAll = dueToday.length === 0 && events.length === 0 && !meal && !binsTonight;

  return (
    <Panel as="section" pad="lg" className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead
        as="header"
        title="Today"
        action={todoist.stale || ha.stale ? <AsOf sources={[todoist, ha]} now={now} /> : null}
      />

      {todoist.stale || ha.stale ? (
        <p className="text-[13px] leading-[1.6] text-warning">{staleSentence(todoist, ha, now)}</p>
      ) : null}

      {/*
        The schedule, plus the two standing facts that are about today.
        `Fact` carries the same 50px mono first column as an event row's time,
        so supper and the bins sit in the list without a seam — which is the
        whole reason they can live here rather than in a block of their own.
      */}
      {events.length > 0 || meal || binsTonight ? (
        <Group
          label="Schedule"
          count={events.length + (meal ? 1 : 0) + (binsTonight ? 1 : 0)}
          dim={ha.stale}
        >
          <ul className="flex flex-col gap-[8px]">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-[12px]">
                <span className="w-[50px] shrink-0 font-mono text-[12px] text-muted-foreground">
                  {e.allDay || !e.startAt ? "all day" : clock(e.startAt)}
                </span>
                <span className="flex min-w-0 grow flex-col gap-[2px]">
                  <span className="text-[14px]">{e.summary}</span>
                  {e.sharedWith ? (
                    <span
                      className="flex items-center gap-[4px] text-[12px]"
                      style={{ color: "var(--purple)" }}
                    >
                      <Users size={11} strokeWidth={2} className="shrink-0" />
                      {e.sharedWith}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}

            {meal ? (
              <li>
                <Fact label="supper" value={meal} />
              </li>
            ) : null}

            {binsTonight && waste ? (
              <li>
                <Fact
                  label="bins"
                  value={`${waste.what}, ${wasteWhen(waste.date, today, now)}`}
                  emphasis
                />
              </li>
            ) : null}
          </ul>
        </Group>
      ) : null}

      {dueToday.length > 0 ? (
        <Group label="Due today" count={dueToday.length} dim={todoist.stale}>
          <TaskList tasks={dueToday} today={today} />
        </Group>
      ) : null}

      {nothingAtAll && !todoist.stale && !ha.stale ? (
        <p className="text-[13px] text-muted-foreground">Nothing is due today.</p>
      ) : null}
    </Panel>
  );
}

/**
 * What has slipped, and what lands next.
 *
 * **Split out of `TodayCard` on 2026-09-01**, and it is a layout change rather
 * than a change of mind: the four groups Vincent asked for are still four
 * groups. Home's working row was one 1292px column of 61px queue rows beside a
 * 340px card — 21:1, with up to 897px of empty column under the short side.
 * Three roughly equal columns fix both, and this is the third.
 *
 * The cut is where it should be anyway: *today* is a commitment, *late* has
 * already gone wrong and *upcoming* has not arrived. One card answers "what am
 * I doing", the other "what am I behind on".
 */
export function AheadCard({
  now,
  today: data,
  className = "",
}: {
  now: Date;
  today: Today;
  className?: string;
}) {
  const today = todayInHouse(now);
  const { late, upcoming, waste, schoolDayTomorrow, todoist } = data;

  // The negation of the rule TodayCard uses, from the same field.
  const binsLater = Boolean(waste) && !waste!.imminent;
  const nothing = late.length === 0 && upcoming.length === 0 && !schoolDayTomorrow && !binsLater;

  return (
    <Panel as="section" pad="lg" className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead
        as="header"
        title="Ahead"
        detail={late.length > 0 ? `${late.length} late` : undefined}
      />

      {/* --- Late first: it has already gone wrong -------------------------- */}
      {late.length > 0 ? (
        <Group label="Late" count={late.length} tone="var(--destructive)" dim={todoist.stale}>
          <TaskList tasks={late} today={today} />
        </Group>
      ) : null}

      {/*
        Tomorrow. The tasks are tomorrow's alone, because the collector reaches
        one day ahead and no further, and the school day is tomorrow's too.

        **The bins are the deliberate exception.** The next collection shows
        here whenever it falls, because it is one line, it is the answer to
        "when do the bins go out", and there is nowhere else on the card for it.
        `wasteWhen` names the weekday, so a Thursday collection cannot read as
        tomorrow.
      */}
      {upcoming.length > 0 || schoolDayTomorrow || binsLater ? (
        <Group
          label="Upcoming"
          count={upcoming.length + (schoolDayTomorrow ? 1 : 0) + (binsLater ? 1 : 0)}
          dim={todoist.stale}
          quiet
        >
          {schoolDayTomorrow || binsLater ? (
            <ul className="flex flex-col gap-[8px]">
              {schoolDayTomorrow ? (
                <li>
                  <Fact label="tomorrow" value={`School day ${schoolDayTomorrow}`} />
                </li>
              ) : null}

              {/* No emphasis: a collection this far out is a note, not a
                  thing to do tonight. `binsLater` is the negation of
                  `imminent`, so it could never be emphasised anyway. */}
              {binsLater && waste ? (
                <li>
                  <Fact
                    label="bins"
                    value={`${waste.what}, ${wasteWhen(waste.date, today, now)}`}
                  />
                </li>
              ) : null}
            </ul>
          ) : null}

          {upcoming.length > 0 ? <TaskList tasks={upcoming} today={today} /> : null}
        </Group>
      ) : null}


      {nothing && !todoist.stale ? (
        <p className="text-[13px] text-muted-foreground">Nothing behind, nothing tomorrow.</p>
      ) : null}
    </Panel>
  );
}

/**
 * A labelled run of rows inside the card.
 *
 * The count sits in the heading so the card can be read without counting, and
 * `tone` is only ever passed by *Late* — colour carries meaning, and "these
 * have already slipped" is the one meaning on this card that has a colour.
 *
 * `quiet` drops *Upcoming* to muted: it is context rather than a call, and at
 * full weight a busy week would out-shout the two things actually due.
 */
function Group({
  label,
  count,
  tone,
  quiet,
  dim,
  children,
}: {
  label: string;
  count: number;
  tone?: string;
  quiet?: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[8px] ${dim ? "opacity-45" : ""}`}>
      <div className="flex items-baseline gap-[8px]">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
            tone ? "" : quiet ? "text-faint" : "text-muted-foreground"
          }`}
          style={tone ? { color: tone } : undefined}
        >
          {label}
        </span>
        <span className="font-mono text-[11px] text-faint">{count}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * One run of task rows. The row itself is unchanged — the grouping above it is
 * what changed, so the "late" tag stays: a Late group of one still benefits
 * from the row saying so where the eye lands.
 */
function TaskList({ tasks, today }: { tasks: TodayTask[]; today: string }) {
  return (
    <ul className="flex flex-col gap-[8px]">
      {tasks.map((task) => {
        const late = task.dueDate < today;

        return (
          <li key={task.id} className="flex items-start gap-[10px]">
            <TickBox externalId={task.externalId} content={task.content} />

            <span className="flex min-w-0 grow flex-col gap-[2px]">
              <span className="text-[14px]">
                {task.content}
                {task.isRecurring ? (
                  <Repeat
                    size={11}
                    strokeWidth={2}
                    className="ml-[6px] inline-block -translate-y-[1px] text-faint"
                    aria-label="recurring"
                  />
                ) : null}
              </span>
              {task.sharedWith.length > 0 ? (
                <span
                  className="flex items-center gap-[4px] text-[12px]"
                  style={{ color: "var(--purple)" }}
                >
                  <Users size={11} strokeWidth={2} className="shrink-0" />
                  shared with {NAMES.format(task.sharedWith)}
                </span>
              ) : null}
            </span>

            <span
              className={`shrink-0 translate-y-[2px] font-mono text-[12px] ${
                late ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {late ? when(task.dueDate, today) : task.dueAt ? clock(task.dueAt) : "today"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * How far off a task is, in words.
 *
 * A bare "late" said nothing about how late, and in Upcoming a bare date is a
 * thing to decode. Both are the same question — how far from today — so both
 * get the same answer: a day count near at hand, a weekday inside the week.
 */
function when(dueDate: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
  );

  if (days < 0) return days === -1 ? "yesterday" : `${-days}d late`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return WEEKDAY.format(new Date(`${dueDate}T12:00:00`)).slice(0, 3);
}

function Fact({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline gap-[12px]">
      <span className="w-[50px] shrink-0 font-mono text-[11px] text-faint">{label}</span>
      <span className={`text-[13px] ${emphasis ? "font-medium text-primary" : ""}`}>{value}</span>
    </div>
  );
}

/** Tomorrow's calendar day in the house. Calendar days, never milliseconds. */
function isoTomorrow(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return todayInHouse(d);
}

/** "today", "out tonight", or the weekday — never a bare date to decode. */
function wasteWhen(date: string, today: string, now: Date): string {
  if (date === today) return "today";
  if (date === isoTomorrow(now)) return "out tonight";

  // Noon, so the date cannot shift under the timezone conversion.
  return WEEKDAY.format(new Date(`${date}T12:00:00`));
}

/**
 * Shown only when one of this card's sources is stale, so it is always amber.
 * The routine clock is in the rail, under the level block.
 */
function AsOf({ sources, now }: { sources: Source[]; now: Date }) {
  const stamps = sources.map((s) => s.asOf).filter((d): d is Date => d !== null);
  if (stamps.length === 0) {
    return <span className="font-mono text-[11px] text-warning">never</span>;
  }

  const oldest = stamps.reduce((a, b) => (a < b ? a : b));
  return (
    <span className="font-mono text-[11px] text-warning">
      as of {clock(oldest)}, {duration(oldest, now)} ago
    </span>
  );
}

function staleSentence(todoist: Source, ha: Source, now: Date): string {
  const names: string[] = [];
  if (todoist.stale) {
    names.push(todoist.asOf ? `Todoist (${duration(todoist.asOf, now)} ago)` : "Todoist (never)");
  }
  if (ha.stale) {
    names.push(ha.asOf ? `Home Assistant (${duration(ha.asOf, now)} ago)` : "Home Assistant (never)");
  }

  return `${NAMES.format(names)} last answered then. What that source contributes below is what it said at the time, not what is true now.`;
}
