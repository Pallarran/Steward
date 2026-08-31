import { Repeat, Users } from "lucide-react";
import { TickBox } from "./tick-box";
import { clock, duration } from "@/lib/format";
import { readToday, type Source, type TodayTask } from "@/lib/today";
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
 * **Four groups, not one list.** It shipped as the appointments followed by a
 * single date-ordered task list with a small "late" tag on the rows that had
 * slipped, and a sentence at the bottom counting them. That buried the most
 * actionable thing on the card inside the least: *late* has already gone wrong,
 * *due today* is the commitment, *upcoming* is only the shape of the week. They
 * are different questions and they now get different headings and weights.
 *
 * Staleness is per source, not per card. Todoist failing must not make the
 * calendar look wrong, so each half dims and dates itself and says which one
 * is out of date rather than discrediting both.
 */
export async function TodayCard() {
  const now = new Date();
  const today = todayInHouse(now);
  const { late, dueToday, upcoming, events, meal, waste, schoolDayTomorrow, todoist, ha } =
    await readToday(now);

  const nothingAtAll =
    late.length === 0 &&
    dueToday.length === 0 &&
    upcoming.length === 0 &&
    events.length === 0 &&
    !meal &&
    !waste &&
    !schoolDayTomorrow;

  return (
    <Panel
      as="section"
      pad="lg"
      className="flex w-full shrink-0 flex-col gap-[12px] lg:w-[340px]"
    >
      <SectionHead
        as="header"
        title="Today"
        action={todoist.stale || ha.stale ? <AsOf sources={[todoist, ha]} now={now} /> : null}
      />

      {todoist.stale || ha.stale ? (
        <p className="text-[13px] leading-[1.6] text-warning">{staleSentence(todoist, ha, now)}</p>
      ) : null}

      {/* --- The schedule -------------------------------------------------- */}
      {events.length > 0 ? (
        <Group label="Schedule" count={events.length} dim={ha.stale}>
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
        </ul>
        </Group>
      ) : null}

      {/* --- Late first: it has already gone wrong -------------------------- */}
      {late.length > 0 ? (
        <Group label="Late" count={late.length} tone="var(--destructive)" dim={todoist.stale}>
          <TaskList tasks={late} today={today} />
        </Group>
      ) : null}

      {dueToday.length > 0 ? (
        <Group label="Due today" count={dueToday.length} dim={todoist.stale}>
          <TaskList tasks={dueToday} today={today} />
        </Group>
      ) : null}

      {upcoming.length > 0 ? (
        <Group label="Upcoming" count={upcoming.length} dim={todoist.stale} quiet>
          <TaskList tasks={upcoming} today={today} />
        </Group>
      ) : null}

      {/* --- The standing facts of the day ---------------------------------- */}
      {meal || waste || schoolDayTomorrow ? (
        <div
          className={`flex flex-col gap-[6px] border-t pt-[12px] ${ha.stale ? "opacity-45" : ""}`}
        >
          {meal ? <Fact label="Supper" value={meal} /> : null}
          {waste ? (
            <Fact
              label="Bins"
              value={`${waste.what}, ${wasteWhen(waste.date, today, now)}`}
              emphasis={waste.imminent}
            />
          ) : null}
          {schoolDayTomorrow ? (
            <Fact label="Tomorrow" value={`School day ${schoolDayTomorrow}`} />
          ) : null}
        </div>
      ) : null}

      {nothingAtAll && !todoist.stale && !ha.stale ? (
        <p className="text-[13px] text-muted-foreground">Nothing is due today.</p>
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

/** "today", "out tonight", or the weekday — never a bare date to decode. */
function wasteWhen(date: string, today: string, now: Date): string {
  if (date === today) return "today";

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === todayInHouse(tomorrow)) return "out tonight";

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
