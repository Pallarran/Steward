"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { tickTask, untickTask } from "@/app/(app)/actions";

/**
 * The checkbox beside a task due today.
 *
 * A client component so the tick can be undone. Unlike undoing a dismissal —
 * which flips a column in Steward's own database — this reopens the task in
 * Todoist, so it is a second network write that can fail, and a failure says so
 * rather than leaving the two with different opinions about whether it is done.
 */
export function TickBox({ externalId, content }: { externalId: string; content: string }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Tick: ${content}`}
      title="Tick — completes it in Todoist"
      className="flex size-[18px] shrink-0 translate-y-[2px] items-center justify-center rounded-[5px] border border-input text-transparent transition-colors hover:border-teal hover:text-teal disabled:opacity-40"
      onClick={() =>
        start(async () => {
          const result = await tickTask(externalId);
          if (result.error) {
            toast.error(result.error);
            return;
          }

          toast(`Ticked ${content}.`, {
            action: {
              label: "Undo",
              onClick: () =>
                start(async () => {
                  const back = await untickTask(externalId);
                  if (back.error) toast.error(back.error);
                  // The local row is not rebuilt here. The next poll is five
                  // minutes away and brings it back with Todoist's own due
                  // date, which is the only version worth having.
                  else toast("Put back. It returns on the next poll.");
                }),
            },
          });
        })
      }
    >
      <Check size={12} strokeWidth={2.4} />
    </button>
  );
}
