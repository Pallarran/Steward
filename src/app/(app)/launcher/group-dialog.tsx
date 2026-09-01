"use client";

import { useId, useState, useTransition } from "react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { addGroup, deleteGroup, moveGroup, renameGroup } from "./actions";

/**
 * A group, added or renamed — and moved, and removed when it is empty.
 *
 * Groups only became a thing on 2026-09-01. Before that a group was free text
 * on each tile and its position on the page was wherever its first tile
 * happened to sit, so none of this was possible: renaming meant editing every
 * tile, and reordering meant moving the one tile that happened to be first.
 */
export function GroupDialog({
  name,
  tileCount,
  trigger,
}: {
  /** Absent when adding. */
  name?: string;
  tileCount?: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();

  const editing = name !== undefined;
  const empty = (tileCount ?? 0) === 0;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = editing ? await renameGroup(formData) : await addGroup(formData);
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

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editing ? name : "Add a group"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Renaming takes every tile in the group with it."
              : "A group can exist before anything is in it, so you can make the shape first and fill it after."}
          </DialogDescription>
        </DialogHeader>

        <form id={formId} action={submit} className="flex flex-col gap-[12px]">
          {editing ? <input type="hidden" name="from" value={name} /> : null}

          <Field label="Name">
            <Input name="name" required autoFocus defaultValue={name ?? ""} placeholder="Media" />
          </Field>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        {editing ? (
          <div className="flex flex-col gap-[10px] border-t pt-[12px]">
            <div className="flex items-center gap-[8px]">
              <Move name={name} direction="up" label="Move up" />
              <Move name={name} direction="down" label="Move down" />
            </div>

            {/*
              Only an empty group. With tiles in it there is no good answer:
              either they go with it, which is a destructive act wearing a
              tidying-up name, or they survive under a heading that comes
              straight back. Saying so beats leaving the control out.
            */}
            {empty ? (
              <ConfirmDialog
                title={`Remove the ${name} group?`}
                description="It holds no tiles, so nothing goes with it."
                action={deleteGroup}
                id={name}
                done={`Removed ${name}.`}
                trigger={
                  <button
                    type="button"
                    className="self-start text-[12px] text-faint transition-colors hover:text-destructive"
                  >
                    Remove this group
                  </button>
                }
              />
            ) : (
              <span className="text-[12px] leading-[1.5] text-faint">
                {tileCount} {tileCount === 1 ? "tile is" : "tiles are"} in this group. Move them
                elsewhere and it can be removed.
              </span>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One step in the page's order. Its own form, so its own action. */
function Move({ name, direction, label }: { name: string; direction: "up" | "down"; label: string }) {
  return (
    <form action={moveGroup}>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="direction" value={direction} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  );
}
