"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { testAi, type AiTestState } from "./actions";

/**
 * Proves the wire, rather than asserting it.
 *
 * The status above this button says Ollama answered `/api/tags`, which only
 * means the daemon is up — it does not mean the model loads, fits in memory, or
 * returns in a usable time. This sends a real prompt and shows what came back,
 * with how long it took.
 *
 * `useTransition` rather than `useActionState`, matching the dialogs: there is
 * no form and no field, so a form action would be ceremony around a button.
 */
export function AiTest({ disabled }: { disabled: boolean }) {
  const [state, setState] = useState<AiTestState | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[10px]">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || pending}
          onClick={() => start(async () => setState(await testAi()))}
        >
          {pending ? "Asking…" : "Send a test prompt"}
        </Button>

        {state?.ms != null && !state.error ? (
          <span className="font-mono text-[13px] text-faint">{seconds(state.ms)}</span>
        ) : null}
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="text-[14px]"
          style={{ color: "var(--destructive)" }}
        >
          {state.error}
        </p>
      ) : null}

      {state?.answer ? (
        <p className="rounded-[10px] border bg-muted/40 px-[12px] py-[10px] text-[14px]">
          {state.answer}
        </p>
      ) : null}
    </div>
  );
}

/** Round trips here are seconds, not milliseconds — 41.2s reads, 41203ms does not. */
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
