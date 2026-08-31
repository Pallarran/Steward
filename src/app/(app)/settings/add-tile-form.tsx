"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addTile, type TileFormState } from "./actions";
import { Select } from "@/components/ui/select";

const initial: TileFormState = { error: null, ok: null };

/**
 * Adding a launcher tile.
 *
 * The monitor field is what makes Steward's launcher worth more than a page of
 * bookmarks: bind a tile to an Uptime Kuma monitor and it carries that
 * service's real status. The list comes from what Kuma is actually watching, so
 * there is no name to type wrong.
 */
export function AddTileForm({ monitors, groups }: { monitors: string[]; groups: string[] }) {
  const [state, formAction, pending] = useActionState(addTile, initial);

  return (
    <div className="flex flex-col gap-[8px]">
      <form action={formAction} className="flex flex-wrap items-center gap-[8px]">
        <Input
          name="name"
          required
          disabled={pending}
          placeholder="Jellyfin"
          aria-label="Tile name"
          className="w-[150px]"
        />
        <Input
          name="url"
          required
          disabled={pending}
          placeholder="192.168.1.200:8096"
          aria-label="Address"
          className="min-w-[200px] grow"
        />
        <Input
          name="group"
          list="tile-groups"
          disabled={pending}
          placeholder="Group — Media, Home…"
          aria-label="Group"
          className="w-[170px]"
        />
        <datalist id="tile-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <Select name="monitor" aria-label="Uptime Kuma monitor" disabled={pending} className="w-[180px] shrink-0">
          <option value="">No status dot</option>
          {monitors.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>

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
