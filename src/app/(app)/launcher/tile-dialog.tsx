"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import type { Tile } from "@/lib/launcher";
import { moveTile, saveTile } from "./actions";

/**
 * A tile, added or edited.
 *
 * **Move up and down live here rather than on the tile.** Position is a
 * property of the tile, and the alternative was two more controls on every card
 * of a grid whose entire job is one clean click. They move it within its own
 * group; a tile changes group by changing the group field.
 */
export function TileDialog({
  tile,
  groups,
  monitors,
  defaultGroup,
  trigger,
}: {
  tile?: Tile;
  /** Existing names, offered in a datalist. Typing a new one creates it. */
  groups: string[];
  monitors: string[];
  defaultGroup?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();

  const editing = tile !== undefined;

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const result = await saveTile(formData);
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
          <DialogTitle>{editing ? tile.name : "Add a tile"}</DialogTitle>
          <DialogDescription>
            The address is never fetched to check it answers — half of these are behind Tailscale
            or asleep, and a tile is a link you click rather than something Steward reads.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} action={submit} className="flex flex-col gap-[12px]">
          {editing ? <input type="hidden" name="id" value={tile.id} /> : null}

          <Field label="Name">
            <Input name="name" required autoFocus defaultValue={tile?.name ?? ""} placeholder="Jellyfin" />
          </Field>

          <Field label="Address" hint="A bare host is fine — http:// is added for you.">
            <Input name="url" required defaultValue={tile?.url ?? ""} placeholder="192.168.1.200:8096" />
          </Field>

          <Field label="Group" hint="Type a new name to make a new group.">
            <Input
              name="group"
              list="tile-groups"
              defaultValue={tile?.group ?? defaultGroup ?? ""}
              placeholder="Media, Home…"
            />
          </Field>

          <datalist id="tile-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>

          <Field label="Status dot" hint="An Uptime Kuma monitor, so the tile carries its state.">
            <Select name="monitor" defaultValue={tile?.monitor ?? ""}>
              <option value="">No status dot</option>
              {monitors.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

        </form>

        {/*
          Outside the form above, and Save reaches back into it by `form={id}`.
          The move buttons are forms of their own — they submit a different
          action to a different end — and **a form inside a form is invalid
          HTML**, which is what the first version of this did.
        */}
        <DialogFooter>
          {editing ? (
            <span className="mr-auto flex items-center gap-[8px]">
              <Move id={tile.id} direction="up" label="Move earlier" />
              <Move id={tile.id} direction="down" label="Move later" />
            </span>
          ) : null}

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

/** One step within the tile's own group. Its own form, so its own action. */
function Move({ id, direction, label }: { id: string; direction: "up" | "down"; label: string }) {
  return (
    <form action={moveTile}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  );
}
