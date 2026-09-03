import { Repeat, Users } from "lucide-react";
import { TickBox } from "./tick-box";
import { clock, duration } from "@/lib/format";
import type { EventRow, Source, Today, TodayTask } from "@/lib/today";
import { todayInHouse } from "@/lib/adapters/todoist";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";

/** "Marylene", "Marylene and Naomi", "Marylene, Naomi and Annabelle". */
const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "America/Toronto" });

/**
 * Home's right column: **Late**, **Today**, **Upcoming**, in that order.
 *
 * **One row shape across all three**, which is the whole point of the
 * 2026-09-02 rewrite. There used to be three: an appointment put its time in a
 * 50px mono column on the *left*; a `Fact` — supper, the bins, the school day —
 * put a *noun* in that same column, so one slot meant "when" on one row and
 * "what kind" on the next; and a task put its tick on the left and its time on
 * the *right*. Vincent's words were that the time moved around and the card did
 * not feel cohesive, and both were the same fault.
 *
 * So: `[when] [what] [tick]`, and **the when column is the only place a time or
 * a day may appear**. The tick moved to the right edge with it, which also
 * makes this card and the queue beside it the same shape — identity left, the
 * thing in the middle, the one action at the right.
 *
 * **Late is its own card and disappears entirely when nothing is late.** It was
 * a group inside a card called *Ahead*, which is the wrong heading for the one
 * thing on the page that has already gone wrong.
 *
 * Staleness stays per source, not per card: Todoist failing must not make the
 * calendar look wrong, so each source dims its own rows and dates itself.
 */

/** Wide enough for `all day`, which the old 50px column silently overflowed. */
const WHEN = "w-[58px]";

export function LateCard({
  now,
  today: data,
  className = "",
}: {
  now: Date;
  today: Today;
  className?: string;
}) {
  const today = todayInHouse(now);
  const { late, todoist } = data;

  // Vincent's instruction, and the rule the gate card follows: a section that
  // has nothing to report is not rendered as a healthy one, it is not rendered.
  if (late.length === 0) return null;

  return (
    <Panel as="section" pad="lg" className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead
        as="header"
        title="Late"
        action={
          todoist.stale ? (
            <AsOf sources={[todoist]} now={now} />
          ) : (
            // The count carries the colour and the title does not. The rows
            // already say "3d late" in red; a red heading over red rows shouts
            // the same thing twice.
            <span className="font-mono text-[13px] text-destructive">{late.length}</span>
          )
        }
      />

      <TaskList tasks={late} today={today} dim={todoist.stale} />
    </Panel>
  );
}

/**
 * Everything time-bound today, whatever its source.
 *
 * **Two groups, not one merged list** — Vincent's call on 2026-09-02. An
 * appointment is something happening to you and a task is something you chose
 * to do; they sort together by clock time and answer different questions.
 *
 * Supper and tonight's bins live in *Schedule* rather than a block of their
 * own, because they are part of today and the row shape now carries them
 * without a seam.
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
   * Which card the bins belong to: the day they go out.
   *
   * `imminent` is exactly this question and `today.ts` already answers it —
   * tonight counts as today, because the bin goes to the kerb this evening for
   * a morning collection. Recomputing that rule here would be a second copy of
   * it, free to drift.
   */
  const binsTonight = Boolean(waste?.imminent);
  const scheduleCount = events.length + (meal ? 1 : 0) + (binsTonight ? 1 : 0);
  const nothingAtAll = dueToday.length === 0 && scheduleCount === 0;

  return (
    <Panel as="section" pad="lg" className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead
        as="header"
        title="Today"
        action={todoist.stale || ha.stale ? <AsOf sources={[todoist, ha]} now={now} /> : null}
      />

      {/* The explanation lives here and on no other card. All three would say
          the same paragraph about the same two sources, one under the other,
          down a single column. The other two carry the amber stamp and the
          dimmed rows, which is the same claim without the repetition. */}
      {todoist.stale || ha.stale ? (
        <p className="text-[14px] leading-[1.6] text-warning">{staleSentence(todoist, ha, now)}</p>
      ) : null}

      {scheduleCount > 0 ? (
        <Group label="Schedule" count={scheduleCount} dim={ha.stale}>
          <ul className="flex flex-col gap-[8px]">
            {events.map((e) => (
              <Row key={e.id} when={eventWhen(e)} what={e.summary} shared={sharedWith(e)} />
            ))}

            {meal ? <Row when="supper" what={meal} /> : null}

            {binsTonight && waste ? (
              <Row when={wasteWhen(waste.date, today, now)} what={waste.what} emphasis />
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
        <p className="text-[14px] text-muted-foreground">Nothing is due today.</p>
      ) : null}
    </Panel>
  );
}

/**
 * What lands next. Named *Upcoming* since 2026-09-02, having been *Ahead*.
 *
 * **No inner groups, because everything here is tomorrow.** `HORIZON_DAYS` is
 * 1, so the collector reaches exactly one day past today and both `upcoming`
 * and `tomorrowEvents` are tomorrow's alone. That is also why no row here says
 * "tomorrow": the card has said it.
 *
 * **The bins are the deliberate exception.** The next collection shows here
 * whenever it falls, because it is one line and it is the answer to "when do
 * the bins go out". It names its own weekday, so a Thursday collection cannot
 * be read as tomorrow.
 */
export function UpcomingCard({
  now,
  today: data,
  className = "",
}: {
  now: Date;
  today: Today;
  className?: string;
}) {
  const today = todayInHouse(now);
  const { upcoming, tomorrowEvents, waste, schoolDayTomorrow, todoist, ha } = data;

  // The negation of the rule TodayCard uses, from the same field.
  const binsLater = Boolean(waste) && !waste!.imminent;
  const nothing =
    upcoming.length === 0 && tomorrowEvents.length === 0 && !schoolDayTomorrow && !binsLater;

  const count =
    upcoming.length + tomorrowEvents.length + (schoolDayTomorrow ? 1 : 0) + (binsLater ? 1 : 0);

  return (
    <Panel as="section" pad="lg" className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead
        as="header"
        title="Upcoming"
        detail={count > 0 ? "tomorrow" : undefined}
        action={todoist.stale || ha.stale ? <AsOf sources={[todoist, ha]} now={now} /> : null}
      />

      {tomorrowEvents.length > 0 || schoolDayTomorrow || binsLater ? (
        <ul className={`flex flex-col gap-[8px] ${ha.stale ? "opacity-45" : ""}`}>
          {tomorrowEvents.map((e) => (
            <Row key={e.id} when={eventWhen(e)} what={e.summary} shared={sharedWith(e)} />
          ))}

          {/* No when: it is tomorrow, like everything else on this card, and
              the school calendar carries a cycle day rather than a time. */}
          {schoolDayTomorrow ? <Row when="" what={`School day ${schoolDayTomorrow}`} /> : null}

          {/* No emphasis: a collection this far out is a note, not something to
              do tonight. `binsLater` is the negation of `imminent`, so it could
              never be emphasised anyway. */}
          {binsLater && waste ? (
            <Row when={wasteWhen(waste.date, today, now)} what={waste.what} />
          ) : null}
        </ul>
      ) : null}

      {upcoming.length > 0 ? <TaskList tasks={upcoming} today={today} dim={todoist.stale} /> : null}

      {nothing && !todoist.stale ? (
        <p className="text-[14px] text-muted-foreground">Nothing tomorrow.</p>
      ) : null}
    </Panel>
  );
}

/**
 * The one row shape: `[when] [what] [tick]`.
 *
 * An appointment, a task, supper and the bins all render through this, which is
 * what makes the column read as one card rather than four kinds of list. The
 * `when` slot is the **only** place a time or a day may appear, and it is
 * allowed to be empty — an untimed task inside *Due today* leaves it blank
 * rather than repeating the heading above it.
 */
function Row({
  when,
  what,
  shared,
  recurring,
  emphasis,
  tone,
  action,
}: {
  when: string;
  what: string;
  /** The purple "who else" line, from a shared calendar or a shared task. */
  shared?: string | null;
  recurring?: boolean;
  /** The bins tonight — the one row on this card that is a thing to do. */
  emphasis?: boolean;
  /** Only *Late* passes one: colour carries meaning, and that is the meaning. */
  tone?: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-[10px]">
      <span
        className={`${WHEN} shrink-0 translate-y-[2px] font-mono text-[13px] ${
          tone ? "" : "text-muted-foreground"
        }`}
        style={tone ? { color: tone } : undefined}
      >
        {when}
      </span>

      <span className="flex min-w-0 grow flex-col gap-[2px]">
        <span className={`text-[15px] ${emphasis ? "font-medium text-primary" : ""}`}>
          {what}
          {recurring ? (
            <Repeat
              size={11}
              strokeWidth={2}
              className="ml-[6px] inline-block -translate-y-[1px] text-faint"
              aria-label="recurring"
            />
          ) : null}
        </span>

        {shared ? (
          <span
            className="flex items-center gap-[4px] text-[13px]"
            style={{ color: "var(--purple)" }}
          >
            <Users size={11} strokeWidth={2} className="shrink-0" />
            {shared}
          </span>
        ) : null}
      </span>

      {action}
    </li>
  );
}

/**
 * A labelled run of rows inside a card.
 *
 * Only *Today* uses these now: *Late* and *Upcoming* are each one list, and a
 * heading above a card heading saying nearly the same word was half of what
 * made the old shape feel doubled.
 */
function Group({
  label,
  count,
  dim,
  children,
}: {
  label: string;
  count: number;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-[8px] ${dim ? "opacity-45" : ""}`}>
      <div className="flex items-baseline gap-[8px]">
        <span className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="font-mono text-[12px] text-faint">{count}</span>
      </div>
      {children}
    </div>
  );
}

function TaskList({
  tasks,
  today,
  dim,
}: {
  tasks: TodayTask[];
  today: string;
  dim?: boolean;
}) {
  return (
    <ul className={`flex flex-col gap-[8px] ${dim ? "opacity-45" : ""}`}>
      {tasks.map((task) => (
        <Row
          key={task.id}
          when={taskWhen(task, today)}
          what={task.content}
          recurring={task.isRecurring}
          shared={
            task.sharedWith.length > 0 ? `shared with ${NAMES.format(task.sharedWith)}` : null
          }
          tone={task.dueDate < today ? "var(--destructive)" : undefined}
          action={<TickBox externalId={task.externalId} content={task.content} />}
        />
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- the labels */

/** An appointment's own time, or the fact that it has none. */
export function eventWhen(event: Pick<EventRow, "allDay" | "startAt">): string {
  return event.allDay || !event.startAt ? "all day" : clock(event.startAt);
}

function sharedWith(event: EventRow): string | null {
  return event.sharedWith ?? null;
}

/**
 * The when column on a task row.
 *
 * **The day decides, not the lateness.** This once read
 * `late ? when(...) : dueAt ? clock(dueAt) : "today"`, and `late` is
 * `dueDate < today` — so every task in *Upcoming*, where by construction
 * `dueDate > today`, fell through to a hardcoded "today". `when` already
 * answered all of it and was simply never called on that branch. That bug is
 * why these are exported and tested rather than left private.
 *
 * **A task due today with no time gets nothing**, and so does one due tomorrow:
 * the card or the group heading above it has already said which day, and
 * repeating it on every row is the noise this rewrite removed.
 */
export function taskWhen(task: Pick<TodayTask, "dueDate" | "dueAt">, today: string): string {
  if (task.dueDate >= today) return task.dueAt ? clock(task.dueAt) : "";
  return lateWhen(task.dueDate, today);
}

/**
 * How far back a day is, in words.
 *
 * A bare "late" said nothing about how late, so this counts. **It handles the
 * past and only the past**, which is the whole of what a task row needs from
 * it: `taskWhen` answers today and tomorrow itself.
 *
 * The version this replaces also carried "today", "tomorrow" and a weekday
 * branch, none of which could be reached from a late date — unreachable arms in
 * a date helper are exactly what let the last bug here hide, so they are gone
 * rather than kept in case.
 */
export function lateWhen(dueDate: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) / 86_400_000,
  );

  return days === 1 ? "yesterday" : `${days}d late`;
}

/** Tomorrow's calendar day in the house. Calendar days, never milliseconds. */
function isoTomorrow(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return todayInHouse(d);
}

/**
 * When the bins go out — never a bare date to decode.
 *
 * `tonight` rather than the old `out tonight`: the value beside it now names
 * the collection itself, so this only has to answer "when", and the column is
 * 58px wide.
 */
export function wasteWhen(date: string, today: string, now: Date): string {
  if (date === today) return "today";
  if (date === isoTomorrow(now)) return "tonight";

  // Noon, so the date cannot shift under the timezone conversion.
  return WEEKDAY.format(new Date(`${date}T12:00:00`)).slice(0, 3);
}

/**
 * Shown only when one of a card's sources is stale, so it is always amber.
 * The routine clock is in the rail, under the level block.
 */
function AsOf({ sources, now }: { sources: Source[]; now: Date }) {
  const stamps = sources.map((s) => s.asOf).filter((d): d is Date => d !== null);
  if (stamps.length === 0) {
    return <span className="font-mono text-[12px] text-warning">never</span>;
  }

  const oldest = stamps.reduce((a, b) => (a < b ? a : b));
  return (
    <span className="font-mono text-[12px] text-warning">
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
