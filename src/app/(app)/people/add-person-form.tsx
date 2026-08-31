"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addPerson, type PersonFormState } from "./actions";

const initial: PersonFormState = { error: null, ok: null };

/**
 * Adding someone.
 *
 * The ceiling is optional and says so. PRD §6's first rule is that Vincent sets
 * his own thresholds and the system never assigns them — so there is no default
 * cadence, no suggestion, and leaving it blank is a real choice rather than an
 * unfinished form.
 */
export function AddPersonForm() {
  const [state, formAction, pending] = useActionState(addPerson, initial);

  return (
    <div className="flex flex-col gap-[8px]">
      <form action={formAction} className="flex flex-wrap items-center gap-[8px]">
        <Input
          name="name"
          required
          disabled={pending}
          placeholder="Name"
          aria-label="Name"
          className="w-[160px]"
        />
        <Input
          name="relation"
          disabled={pending}
          placeholder="Mother, friend…"
          aria-label="Relation"
          className="w-[150px]"
        />
        <Input
          name="intention"
          disabled={pending}
          placeholder="Call every few weeks"
          aria-label="Intention"
          className="min-w-[200px] grow"
        />
        <Input
          name="cadenceDays"
          type="number"
          min={1}
          disabled={pending}
          placeholder="Days"
          aria-label="Nudge after this many days — leave blank for none"
          title="Nudge after this many days. Blank means never."
          className="w-[92px]"
        />
        <Button type="submit" disabled={pending}>
          Add
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
