import { Check, TriangleAlert } from "lucide-react";
import { listQueue } from "@/lib/queue";
import { anyCollectorStale } from "@/lib/systems";
import { EmptyState } from "@/components/shell/empty-state";
import { QueueRow } from "./queue-row";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";

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
    <Panel as="section" pad="lg" className="flex grow flex-col gap-[16px] pb-[10px]">
      <SectionHead
        as="header"
        title="Queue"
        detail={items.length > 0 ? "not yet ranked" : undefined}
      />

      {items.length === 0 ? <EmptyQueue stale={await anyCollectorStale()} /> : (
        <div className="flex flex-col gap-[2px]">
          {items.map((item, i) => (
            <QueueRow key={item.id} item={item} first={i === 0} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * Reads as an achievement — but only when it has earned the right to.
 *
 * An empty queue with a failing collector is a failed load wearing an
 * achievement's clothes, and congratulating Vincent for it is the precise
 * failure rule 2 exists to prevent. So the empty state asks first.
 */
function EmptyQueue({ stale }: { stale: boolean }) {
  // `tone` carries the whole distinction. This is the one empty state in
  // Steward whose meaning depends on something other than being empty.
  return stale ? (
    <EmptyState
      icon={TriangleAlert}
      tone="warning"
      title="Nothing to show, and that is not good news"
      description="A collector is failing, so this is empty because nothing arrived, not because you cleared it. The gate above names which one."
    />
  ) : (
    <EmptyState icon={Check} accent="var(--teal)" title="The queue is clear" description="Nothing is waiting on you." />
  );
}
