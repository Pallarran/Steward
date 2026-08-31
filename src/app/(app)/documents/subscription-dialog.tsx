"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/shell/field";
import type { SubscriptionView } from "@/lib/documents";
import { saveSubscription } from "./actions";
import { Select } from "@/components/ui/select";

const CADENCES = ["weekly", "monthly", "quarterly", "yearly"];

/**
 * A subscription, added or edited.
 *
 * Documents was the last page still editing through a `<details>` disclosure —
 * nine inputs unfolding inside a row — while everything else had moved to
 * dialogs. Same component for both, keyed off whether a record was passed.
 */
export function SubscriptionDialog({
  sub,
  trigger,
}: {
  sub?: SubscriptionView;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const editing = sub !== undefined;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await saveSubscription(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? sub.name : "Add a subscription"}</DialogTitle>
          <DialogDescription>
            The date can be <em>any</em> renewal, past or future — the next one is worked out from
            it and the cadence, so the date on last month&rsquo;s statement is exactly right.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-[12px]">
          {editing ? <input type="hidden" name="id" value={sub.id} /> : null}

          <Field label="Service">
            <Input name="name" required autoFocus defaultValue={sub?.name ?? ""} placeholder="Netflix" />
          </Field>

          <div className="flex items-end gap-[10px]">
            <Field label="Amount">
              <Input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={sub ? (sub.amountCents / 100).toFixed(2) : ""}
                placeholder="18.99"
                className="w-[110px]"
              />
            </Field>
            <Field label="How often">
              <Select name="cadence" defaultValue={sub?.cadence ?? "monthly"} className="w-[130px]">
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex items-end gap-[10px]">
            <Field label="A renewal date">
              <Input
                name="renewsOn"
                type="date"
                required
                defaultValue={sub ? sub.renewsOn.toISOString().slice(0, 10) : ""}
                className="w-[170px]"
              />
            </Field>
            <Field label="Warn me" hint="Days. Blank means never.">
              <Input
                name="noticeDays"
                type="number"
                min={0}
                defaultValue={sub?.noticeDays ?? 10}
                placeholder="Never"
                className="w-[100px]"
              />
            </Field>
          </div>

          <Field label="Which card">
            <Input name="card" defaultValue={sub?.card ?? ""} placeholder="Visa ·1234" />
          </Field>

          <Field label="Cancel link" hint="The queue row goes straight here when it renews soon.">
            <Input name="cancelUrl" defaultValue={sub?.cancelUrl ?? ""} />
          </Field>

          <Field label="Notes">
            <Input name="notes" defaultValue={sub?.notes ?? ""} placeholder="Anything worth remembering" />
          </Field>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            {/* "Discard", not "Cancel": on this page "cancel" already means
                ending a subscription, and a Cancel button inside the Netflix
                dialog should not look like it might do that. */}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Discard
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
