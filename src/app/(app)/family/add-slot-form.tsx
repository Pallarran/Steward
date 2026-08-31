"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSlot, type SlotFormState } from "./actions";

const initial: SlotFormState = { error: null, ok: null };

export function AddSlotForm({ suggested }: { suggested: string }) {
  const [state, formAction, pending] = useActionState(addSlot, initial);

  return (
    <div className="flex flex-col gap-[8px]">
      <form action={formAction} className="flex flex-wrap items-center gap-[8px]">
        <Input
          name="month"
          required
          disabled={pending}
          defaultValue={suggested}
          placeholder="2027-04"
          aria-label="Month, as YYYY-MM"
          className="w-[120px] font-mono"
        />
        <Input
          name="title"
          disabled={pending}
          placeholder="What it is, if you know yet"
          aria-label="Plan"
          className="min-w-[220px] grow"
        />
        <Button type="submit" disabled={pending}>
          Add month
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-[13px] text-teal">{state.ok}</p> : null}
    </div>
  );
}
