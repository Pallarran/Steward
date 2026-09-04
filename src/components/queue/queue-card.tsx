import { Check, TriangleAlert } from "lucide-react";
import { listQueue } from "@/lib/queue";
import { anyCollectorStale } from "@/lib/systems";
import { CaptureBox } from "@/components/capture/capture-box";
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
export async function QueueCard({ className = "" }: { className?: string }) {
  const items = await listQueue();

  return (
    <Panel
      as="section"
      pad="lg"
      className={`flex flex-col gap-[16px] @min-[720px]:min-h-0 ${className}`}
    >
      {/*
        `more` rather than "not yet ranked" when the list is capped. Something
        being held back is a more useful thing to say than a ranking that does
        not run yet — and a truncated list that does not say so is the failure
        this convention exists to stop. Same wording as News.

        **Capture lives here from 2026-09-04**, out of Home's page header. A
        captured thought goes straight to Todoist's Inbox and comes back as a
        row in this very list, so the box and its consequence are now the same
        object — and Home got the 70px the header was spending back.
      */}
      <SectionHead
        as="header"
        title="Queue"
        detail={items.length > 0 ? `${items.length} · not yet ranked` : undefined}
        // `self-center` because the head is baseline-aligned for text and this
        // is a 36px bordered box; baselining it would hang it below the rule.
        action={
          <span className="self-center">
            <CaptureBox />
          </span>
        }
      />

      {items.length === 0 ? <EmptyQueue stale={await anyCollectorStale()} /> : (
        // The rows scroll, not the card: the heading and its count stay put,
        // and the page around it does not move at all.
        <div className="flex flex-col gap-[2px] @min-[720px]:min-h-0 @min-[720px]:overflow-y-auto">
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
