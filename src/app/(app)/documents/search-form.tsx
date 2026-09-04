"use client";

import { useActionState } from "react";
import { NotKnown } from "@/components/shell/not-known";
import { ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { search, type SearchState } from "./actions";

/** Lives here rather than in actions.ts: a `"use server"` file may only export
 *  async functions. */
const empty: Omit<SearchState, "connected"> = { query: "", results: null, error: null };

/**
 * Paperless search.
 *
 * The one place in Steward that reaches a source from the UI — a deliberate,
 * bounded exception to rule 1, with the reasoning in `src/lib/paperless.ts`.
 * Everything here fails inside this box: an unreachable Paperless produces a
 * line of amber and leaves the rest of the page alone.
 */
export function SearchForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(search, { ...empty, connected });

  if (!connected) {
    return (
      <NotKnown>
        Not connected. Set <span className="font-mono text-[13px]">PAPERLESS_BASE_URL</span> and{" "}
        <span className="font-mono text-[13px]">PAPERLESS_TOKEN</span> and this becomes a search
        box. Steward never copies the archive — it asks Paperless when you ask it, and Paperless
        stays the document store.
      </NotKnown>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <form action={formAction} className="flex items-center gap-[8px]">
        <Input
          name="query"
          required
          disabled={pending}
          defaultValue={state.query}
          placeholder="Insurance, warranty, the boiler…"
          aria-label="Search your documents"
          className="grow"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Looking…" : "Search"}
        </Button>
      </form>

      {state.error ? (
        <p role="alert" className="text-[14px] text-warning">
          {state.error}
        </p>
      ) : null}

      {/* Null is "you have not searched yet"; an empty array is "nothing
          matched". Rendering them the same would make a working search look
          broken. */}
      {state.results !== null ? (
        state.results.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            Nothing matched “{state.query}”. Paperless answered — it simply has no such document.
          </p>
        ) : (
          <ul className="flex flex-col gap-[2px]">
            {state.results.map((doc) => (
              <li key={doc.id}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover"
                >
                  <Search size={14} strokeWidth={1.8} className="shrink-0 text-faint" />
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate text-[15px] font-medium">{doc.title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {[doc.correspondent, doc.type, doc.created?.slice(0, 10)]
                        .filter(Boolean)
                        .join(" · ") || "no details"}
                    </span>
                  </span>
                  <ExternalLink size={13} strokeWidth={1.8} className="shrink-0 text-faint" />
                </a>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
