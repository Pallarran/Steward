import { Check, Repeat, Users } from "lucide-react";
import { tickTask } from "@/app/(app)/actions";
import { clock, duration } from "@/lib/format";
import { readToday, type Source } from "@/lib/today";
import { todayInHouse } from "@/lib/adapters/todoist";

/** "Marylene", "Marylene and Naomi", "Marylene, Naomi and Annabelle". */
const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "America/Toronto" });

/**
 * Today: everything time-bound today, whatever its source.
 *
 * 340px fixed beside the queue — docs/DESIGN.md, Layout.
 *
 * Staleness is per source, not per card. Todoist failing must not make the
 * calendar look wrong, so each half dims and dates itself and says which one
 * is out of date rather than discrediting both.
 */
export async function TodayCard() {
  const now = new Date();
  const today = todayInHouse(now);
  const { tasks, overdue, events, meal, waste, schoolDayTomorrow, todoist, ha } =
    await readToday(now);

  const nothingAtAll =
    tasks.length === 0 && events.length === 0 && !meal && !waste && !schoolDayTomorrow;

  return (
    <section className="flex w-[340px] shrink-0 flex-col gap-[14px] rounded-[10px] border bg-card px-[18px] py-[17px]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Today</h2>
        {todoist.stale || ha.stale ? <AsOf sources={[todoist, ha]} now={now} /> : null}
      </header>

      {todoist.stale || ha.stale ? (
        <p className="text-[13px] leading-[1.6] text-warning">{staleSentence(todoist, ha, now)}</p>
      ) : null}

      {/* --- Appointments -------------------------------------------------- */}
      {events.length > 0 ? (
        <ul className={`flex flex-col gap-[9px] ${ha.stale ? "opacity-45" : ""}`}>
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-[12px]">
              <span className="w-[50px] shrink-0 font-mono text-[12px] text-muted-foreground">
                {e.allDay || !e.startAt ? "all day" : clock(e.startAt)}
              </span>
              <span className="flex min-w-0 grow flex-col gap-[2px]">
                <span className="text-[14px]">{e.summary}</span>
                {e.sharedWith ? (
                  <span
                    className="flex items-center gap-[5px] text-[12px]"
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
      ) : null}

      {/* --- Tasks --------------------------------------------------------- */}
      {tasks.length > 0 ? (
        <ul className={`flex flex-col gap-[9px] ${todoist.stale ? "opacity-45" : ""}`}>
          {tasks.map((task) => {
            const late = task.dueDate < today;
            return (
              <li key={task.id} className="flex items-start gap-[11px]">
                <form action={tickTask} className="shrink-0">
                  <input type="hidden" name="externalId" value={task.externalId} />
                  <button
                    type="submit"
                    aria-label={`Tick: ${task.content}`}
                    title="Tick — completes it in Todoist"
                    className="flex size-[18px] translate-y-[2px] items-center justify-center rounded-[5px] border border-input text-transparent transition-colors hover:border-teal hover:text-teal"
                  >
                    <Check size={12} strokeWidth={2.4} />
                  </button>
                </form>

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
                      className="flex items-center gap-[5px] text-[12px]"
                      style={{ color: "var(--purple)" }}
                    >
                      <Users size={11} strokeWidth={2} className="shrink-0" />
                      shared with {NAMES.format(task.sharedWith)}
                    </span>
                  ) : null}
                </span>

                <span
                  className={`shrink-0 translate-y-[2px] font-mono text-[12px] ${late ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {late ? "late" : task.dueAt ? clock(task.dueAt) : "today"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* --- The standing facts of the day ---------------------------------- */}
      {meal || waste || schoolDayTomorrow ? (
        <div
          className={`flex flex-col gap-[7px] border-t pt-[12px] ${ha.stale ? "opacity-45" : ""}`}
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

      {overdue > 0 && !todoist.stale ? (
        <p className="text-[12px] text-muted-foreground">
          {overdue} of these {overdue === 1 ? "was" : "were"} due before today.
        </p>
      ) : null}
    </section>
  );
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
