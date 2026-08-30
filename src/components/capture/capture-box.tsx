"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { captureThought, type CaptureState } from "@/app/(app)/actions";

const initial: CaptureState = { error: null };

/**
 * The capture field, beside the greeting — docs/DESIGN.md, Layout.
 *
 * Todoist stays where Vincent captures on the go; this is for the thought that
 * arrives while he is already looking at Steward, so it has to cost nothing:
 * type, enter, gone. No dialog, no category picker, no confirmation.
 */
export function CaptureBox() {
  const [state, formAction, pending] = useActionState(captureThought, initial);

  return (
    <div className="flex flex-col items-end gap-[4px]">
      <form
        action={formAction}
        className="flex w-[320px] items-center gap-[11px] rounded-[10px] border bg-card px-[14px] py-[9px] focus-within:border-primary"
      >
        <Plus size={15} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
        <input
          name="text"
          // Repopulated when the action failed, so a rejected capture is still
          // on screen rather than lost. The key forces React to take the new
          // value after a failure instead of keeping the emptied input.
          key={state.error ? "failed" : "ready"}
          defaultValue={state.error ? (state.text ?? "") : ""}
          required
          maxLength={500}
          disabled={pending}
          placeholder="Capture a thought"
          aria-label="Capture a thought"
          autoComplete="off"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </form>
      {state.error ? (
        <span role="alert" className="text-[12px] text-destructive">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}
