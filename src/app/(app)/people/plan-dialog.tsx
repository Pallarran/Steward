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
import type { PersonView } from "@/lib/people";
import { savePlan } from "./actions";
import { Field } from "@/components/shell/field";

/**
 * What you are next doing together, and when.
 *
 * Available to anyone rather than only the girls — "lunch with Dad on Sunday"
 * is the same thing as an afternoon with a daughter, and the children's section
 * simply leads with it.
 */
export function PlanDialog({
  person,
  trigger,
}: {
  person: PersonView;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await savePlan(formData);
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

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Time with {person.name}</DialogTitle>
          <DialogDescription>
            What you are doing and when. Clearing the plan leaves it as no plan, which is the
            state worth seeing.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-[12px]">
          <input type="hidden" name="id" value={person.id} />

          <Field label="What you are doing">
            <Input
              name="planTitle"
              autoFocus
              defaultValue={person.planTitle ?? ""}
              placeholder="A campaign session, Saturday afternoon"
            />
          </Field>

          <Field label="When">
            <Input
              name="planDate"
              type="date"
              defaultValue={person.planDate ? person.planDate.toISOString().slice(0, 10) : ""}
              className="w-[170px]"
            />
          </Field>

          {error ? (
            <p role="alert" className="text-[14px] text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
