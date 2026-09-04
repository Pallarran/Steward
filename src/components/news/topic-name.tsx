"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { renameTopic } from "@/app/(app)/news/actions";
import { Input } from "@/components/ui/input";

/**
 * A topic's name, and a way to change it.
 *
 * **There was none.** The only path was delete-and-recreate, and deleting a
 * topic cascades every feed in it and every article they had ever collected —
 * so a typo in "homelab" cost the archive. That is the sharpest instance in the
 * app of a record you can create and destroy but not correct.
 *
 * A reader by default, like the queue dialog's rename: the heading stays a
 * heading until the pencil is pressed.
 */
export function TopicName({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="flex min-w-0 items-baseline gap-[6px]">
        <h3 className="min-w-0 truncate text-[15px] font-medium">{name}</h3>
        <button
          type="button"
          onClick={() => {
            setText(name);
            setError(null);
            setEditing(true);
          }}
          aria-label={`Rename ${name}`}
          title="Rename"
          className="shrink-0 text-faint transition-colors hover:text-foreground"
        >
          <Pencil size={12} strokeWidth={1.8} />
        </button>
      </span>
    );
  }

  function save(formData: FormData) {
    start(async () => {
      const result = await renameTopic(formData);
      // `name` is unique, so a clash is a real answer rather than a silent
      // merge of two topics into one.
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  return (
    <span className="flex min-w-0 grow flex-col gap-[2px]">
      <form action={save} className="flex min-w-0 items-center gap-[6px]">
        <input type="hidden" name="id" value={id} />
        <Input
          name="name"
          value={text}
          autoFocus
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Escape would otherwise close nothing here and bubble to any
            // dialog above it.
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (!pending && text.trim() === name) setEditing(false);
          }}
          className="h-[28px] grow text-[14px]"
        />
      </form>

      {error ? (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
