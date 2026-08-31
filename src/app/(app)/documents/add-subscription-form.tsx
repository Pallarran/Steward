"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSubscription, type SubscriptionFormState } from "./actions";

const initial: SubscriptionFormState = { error: null, ok: null };

/**
 * The renewal date accepts **any** renewal, past or future — the next one is
 * derived from it and the cadence. That is worth saying on the form, because
 * "renews on" reads like it must be a future date, and being able to type the
 * one on last month's statement is the whole point.
 */
export function AddSubscriptionForm() {
  const [state, formAction, pending] = useActionState(addSubscription, initial);

  return (
    <div className="flex flex-col gap-[8px]">
      <form action={formAction} className="flex flex-wrap items-center gap-[8px]">
        <Input
          name="name"
          required
          disabled={pending}
          placeholder="Netflix"
          aria-label="Service"
          className="w-[150px]"
        />
        <Input
          name="amount"
          required
          disabled={pending}
          placeholder="18.99"
          inputMode="decimal"
          aria-label="Amount"
          className="w-[100px]"
        />
        <select
          name="cadence"
          defaultValue="monthly"
          disabled={pending}
          aria-label="How often"
          className="h-[36px] rounded-[8px] border border-input bg-input-fill px-[10px] text-[13px]"
        >
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
          <option value="quarterly">quarterly</option>
          <option value="yearly">yearly</option>
        </select>
        <Input
          name="renewsOn"
          type="date"
          required
          disabled={pending}
          aria-label="A renewal date, past or future"
          title="Any renewal date, past or future. The next one is worked out from this."
          className="w-[150px]"
        />
        <Input
          name="card"
          disabled={pending}
          placeholder="Visa ·1234"
          aria-label="Which card"
          className="w-[120px]"
        />
        <Input
          name="cancelUrl"
          disabled={pending}
          placeholder="Cancel link"
          aria-label="Cancel link"
          className="min-w-[160px] grow"
        />
        <Input
          name="noticeDays"
          type="number"
          min={0}
          defaultValue={10}
          disabled={pending}
          aria-label="Days of warning — blank for none"
          title="Days of warning before it renews. Blank means never warn."
          className="w-[86px]"
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
