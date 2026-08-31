"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFeed, type FeedFormState } from "./actions";
import { Select } from "@/components/ui/select";

const initial: FeedFormState = { error: null, ok: null };

/**
 * Paste anything: a site, a YouTube channel, a Steam game page.
 *
 * Steward resolves it to a real feed and fetches it before saving, so the
 * message underneath is a verdict rather than a hope — either the number of
 * items it actually found, or why it could not.
 */
export function AddFeedForm({ topics }: { topics: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(addFeed, initial);

  if (topics.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Add a topic first — every feed belongs to one, and topics are how the morning ranking
        stops one subject drowning the rest.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <form action={formAction} className="flex items-center gap-[8px]">
        <Input
          name="input"
          key={state.error ? "failed" : "ready"}
          defaultValue={state.error ? (state.input ?? "") : ""}
          required
          disabled={pending}
          placeholder="arstechnica.com, a YouTube channel, a Steam game…"
          aria-label="Feed address"
          className="grow"
        />
        <Select name="topicId" aria-label="Topic" disabled={pending} className="w-[160px] shrink-0">
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Add"}
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-[13px] text-teal">{state.ok}</p> : null}
      {pending ? (
        <p className="text-[12px] text-muted-foreground">
          Fetching it to check it works before saving.
        </p>
      ) : null}
    </div>
  );
}
