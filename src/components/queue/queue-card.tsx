import { listQueue } from "@/lib/queue";
import { QueueRow } from "./queue-row";

/**
 * One prioritized list, no tiers.
 *
 * The "as of" stamp says "not yet ranked" until step 10 builds the 06:00
 * ranking job. It will read "ordered at 06:00" then. Naming a ranking that
 * does not run yet would be the exact thing rule 2 forbids.
 */
export async function QueueCard() {
  const items = await listQueue();

  return (
    <section className="flex grow flex-col gap-[15px] rounded-[10px] border bg-card px-[18px] pt-[18px] pb-[10px]">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Queue</h2>
        <span className="font-mono text-[11px] text-faint">
          {items.length > 0 ? "not yet ranked" : ""}
        </span>
      </header>

      {items.length === 0 ? <EmptyQueue /> : (
        <div className="flex flex-col gap-[2px]">
          {items.map((item, i) => (
            <QueueRow key={item.id} item={item} first={i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Reads as an achievement, not a failed load.
 *
 * **This becomes conditional in step 5.** Once collectors exist, an empty
 * queue with a failing collector is a failed load wearing an achievement's
 * clothes — the exact thing the staleness rule exists to prevent. From then on
 * this must check SourceStatus first and go amber instead of congratulating
 * anyone. Right now no collector exists, so an empty queue is simply empty.
 */
function EmptyQueue() {
  return (
    <div className="flex grow flex-col items-center justify-center gap-[9px] py-[48px] text-center">
      <p className="text-[17px] font-semibold">The queue is clear</p>
      <p className="max-w-[420px] text-[13px] leading-[1.6] text-muted-foreground">
        Nothing is waiting on you.
      </p>
    </div>
  );
}
