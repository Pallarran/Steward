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
import { savePerson, type Result } from "./actions";
import type { PersonView } from "@/lib/people";
import { Select } from "@/components/ui/select";

/**
 * Adding and editing someone, in one dialog.
 *
 * The forms used to sit on the page — three of them, plus a `<details>` per row
 * holding four inputs and two selects. Vincent asked for Chronicle's pattern
 * instead: a form invoked from the view rather than occupying it. The page is
 * now something you glance at.
 *
 * One component for both, keyed off whether a `person` was passed, which is the
 * shape Chronicle's tools-manager uses. Two dialogs would mean two copies of
 * six fields drifting apart.
 *
 * Radix gives the focus trap, Escape, scroll lock and focus returning to the
 * button that opened it. The only thing to add is `autoFocus` on the name.
 */
export function PersonDialog({
  person,
  defaultKind,
  circles,
  trigger,
}: {
  person?: PersonView;
  /** What the section this was opened from is for. */
  defaultKind?: "spouse" | "child" | "contact";
  /** Existing groupings, offered rather than imposed. */
  circles: string[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const editing = person !== undefined;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      // Called directly rather than through useActionState: closing on success
      // would otherwise need an effect, and this project has already been
      // bitten by react-hooks/set-state-in-effect once.
      const result: Result = await savePerson(formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A dismissed dialog should not reopen still showing yesterday's
        // complaint.
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? person.name : "Add someone"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "What changes here is how Steward talks about them, never what you owe them."
              : "Who they are and how often you would like to be nudged. Both are yours to set."}
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-[12px]">
          {editing ? <input type="hidden" name="id" value={person.id} /> : null}

          <Field label="Name">
            <Input name="name" required autoFocus defaultValue={person?.name ?? ""} />
          </Field>

          <Field label="What they are to you">
            <Select name="kind" defaultValue={person?.kind ?? defaultKind ?? "contact"}>
              <option value="spouse">Spouse — the couple planner</option>
              <option value="child">Child — one on one time</option>
              <option value="contact">Family, a friend, anyone else</option>
            </Select>
          </Field>

          <Field label="Group" hint="Family, Friends, Neighbours — your own words">
            <Input
              name="circle"
              list="people-circles"
              defaultValue={person?.circle ?? ""}
              placeholder="Family"
            />
            <datalist id="people-circles">
              {circles.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Relation" hint="Mother, friend since school">
            <Input name="relation" defaultValue={person?.relation ?? ""} />
          </Field>

          <Field label="Intention" hint="In your words">
            <Input
              name="intention"
              defaultValue={person?.intention ?? ""}
              placeholder="Call every few weeks"
            />
          </Field>

          <Field
            label="Nudge after"
            hint="Days. Leave it blank and Steward never will — a threshold you did not choose is one it chose for you."
          >
            <Input
              name="cadenceDays"
              type="number"
              min={1}
              defaultValue={person?.cadenceDays ?? ""}
              placeholder="Never"
              className="w-[110px]"
            />
          </Field>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
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

