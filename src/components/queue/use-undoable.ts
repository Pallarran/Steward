"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { Undoable } from "@/app/(app)/actions";

/**
 * Do a thing, say it happened, offer to take it back.
 *
 * **Undo is offered only when the action succeeded.** Undoing something that
 * did not happen would be worse than no undo at all, and the server actions all
 * return `{ error }` rather than throwing precisely so this can tell.
 *
 * A neutral `toast`, never `toast.success` — clearing a row is a thing that
 * happened, not an achievement, and the green tick would argue otherwise.
 *
 * **Lifted out of `queue-row.tsx` on 2026-09-02**, when the Todoist triage
 * controls became the third place wanting it. It is the app's undo contract,
 * and a contract copied into three components is three contracts.
 */
export function useUndoable() {
  const [pending, start] = useTransition();

  function run(action: () => Promise<Undoable>, done: string, undo?: () => Promise<Undoable>) {
    start(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }

      // No undo where there is nothing to undo with — a deleted Todoist task
      // cannot be brought back, and offering the button would be a lie.
      if (!undo) {
        toast(done);
        return;
      }

      toast(done, {
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              const back = await undo();
              if (back.error) toast.error(back.error);
            }),
        },
      });
    });
  }

  return { pending, run };
}
