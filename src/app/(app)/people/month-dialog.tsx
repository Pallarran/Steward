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
import type { SlotRow, Names } from "@/lib/couple";
import { saveSlot } from "./planner-actions";
import { Field } from "@/components/shell/field";
import { Select } from "@/components/ui/select";

const STATUSES = [
  { value: "open", label: "needs an idea" },
  { value: "planning", label: "in planning" },
  { value: "booked", label: "booked" },
  { value: "done", label: "done" },
];

/** One month of the couple plan, added or edited. */
export function MonthDialog({
  slot,
  suggestedMonth,
  suggestedMine,
  names,
  trigger,
}: {
  slot?: SlotRow;
  suggestedMonth?: string;
  /** The odd/even rule's answer for the suggested month, offered as a default. */
  suggestedMine?: boolean;
  names: Names;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const editing = slot !== undefined;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await saveSlot(formData);
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

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? "This month" : "Add a month"}</DialogTitle>
          <DialogDescription>
            {names.theirs} takes the odd months and {names.mine} the even ones — a default, not a
            law. Change whose it is whenever you swap.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-[12px]">
          {editing ? <input type="hidden" name="id" value={slot.id} /> : null}

          <Field label="Month">
            <Input
              name="month"
              required
              autoFocus={!editing}
              defaultValue={slot?.month ?? suggestedMonth ?? ""}
              placeholder="2027-04"
              className="w-[140px] font-mono"
            />
          </Field>

          <Field label="Whose month">
            <Select name="mine" defaultValue={(slot?.mine ?? suggestedMine ?? true) ? "mine" : "theirs"}>
              <option value="mine">{names.mine}</option>
              <option value="theirs">{names.theirs}</option>
            </Select>
          </Field>

          <Field label="Plan">
            <Input
              name="title"
              autoFocus={editing}
              defaultValue={slot?.title ?? ""}
              placeholder="What it is, if you know yet"
            />
          </Field>

          <Field label="Detail" hint="Bookings, times, what is still to decide">
            <Input name="detail" defaultValue={slot?.detail ?? ""} />
          </Field>

          <Field label="The real date" hint="Need not fall inside the month itself">
            <Input
              name="eventDate"
              type="date"
              defaultValue={slot?.eventDate ? slot.eventDate.toISOString().slice(0, 10) : ""}
              className="w-[170px]"
            />
          </Field>

          <Field label="Where it has got to">
            <Select name="status" defaultValue={slot?.status ?? "open"}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
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
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
