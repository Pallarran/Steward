import { Check, Repeat, Users } from "lucide-react";
import { tickTask } from "@/app/(app)/actions";
import { clock, duration } from "@/lib/format";
import { readTodayTasks } from "@/lib/today";
import { todayInHouse } from "@/lib/adapters/todoist";

/** "Marylene", "Marylene and Naomi", "Marylene, Naomi and Annabelle". */
const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * Today: everything time-bound today, whatever its source. Tasks now;
 * calendars, tonight's meal, waste collection and tomorrow's school day
 * arrive with the Home Assistant step.
 *
 * 340px fixed beside the queue — docs/DESIGN.md, Layout.
 *
 * A stale panel dims its numbers, turns its "as of" stamp amber, and says in
 * words when the source last answered. It never shows old data as current.
 */
export async function TodayCard() {
  const now = new Date();
  const { tasks, overdue, asOf, stale } = await readTodayTasks(now);
  const today = todayInHouse(now);

  return (
    <section className="flex w-[340px] shrink-0 flex-col gap-[13px] rounded-[10px] border bg-card px-[18px] py-[17px]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Today</h2>
        <span className={`font-mono text-[11px] ${stale ? "text-warning" : "text-faint"}`}>
          {asOf
            ? stale
              ? `as of ${clock(asOf)}, ${duration(asOf, now)} ago`
              : `as of ${clock(asOf)}`
            : "never"}
        </span>
      </header>

      {stale ? (
        <p className="text-[13px] leading-[1.6] text-warning">
          {asOf
            ? `Todoist last answered ${duration(asOf, now)} ago. What follows is what it said then, not what is true now.`
            : "Todoist has not answered yet. Nothing below has been read from it."}
        </p>
      ) : null}

      {tasks.length === 0 && !stale ? (
        <p className="text-[13px] text-muted-foreground">Nothing is due today.</p>
      ) : (
        // Dimmed to about 45 percent when stale, so old data never reads as
        // current — docs/DESIGN.md, stale panel.
        <ul className={`flex flex-col gap-[9px] ${stale ? "opacity-45" : ""}`}>
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
                  {/*
                    Purple is the family accent — docs/DESIGN.md. A shared task
                    is still yours to do, so it stays on the card; it just does
                    not pretend to be yours alone.
                  */}
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
      )}

      {overdue > 0 && !stale ? (
        <p className="text-[12px] text-muted-foreground">
          {overdue} of these {overdue === 1 ? "was" : "were"} due before today.
        </p>
      ) : null}
    </section>
  );
}
