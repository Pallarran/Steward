"use client";

import { useState } from "react";
import type { LauncherTile } from "@/lib/launcher";
import { Dot } from "@/components/shell/dot";
import { Pencil } from "lucide-react";

/**
 * Where a self-hosted service keeps its icon.
 *
 * `/favicon.ico` is the convention and plenty of things honour it, but plenty
 * do not: Jellyfin serves its own at `/web/favicon.ico`, because its UI lives
 * under `/web`. Rather than guess once and give up, the tile walks this list
 * until an image decodes.
 *
 * Cheap to be wrong: these are LAN requests, the browser caches them, and a
 * miss costs a 404 that never leaves the house.
 */
const ICON_PATHS = [
  "/favicon.ico",
  "/web/favicon.ico",
  "/apple-touch-icon.png",
  "/favicon.png",
  "/static/favicon.ico",
];

function iconCandidates(url: string, advertised: string | null): string[] {
  try {
    const parsed = new URL(url);
    // What the service itself said, first. The paths below are only the
    // fallback for a service that was asleep when the tile was added.
    const found = [...(advertised ? [advertised] : []), ...ICON_PATHS.map((p) => parsed.origin + p)];

    // A tile pointing at a sub-path — a service behind a reverse proxy at
    // /jellyfin, say — keeps its icon under that path, not at the origin.
    const directory = parsed.pathname.replace(/\/[^/]*$/, "/");
    if (directory !== "/") {
      found.unshift(new URL("favicon.ico", parsed.origin + directory).toString());
    }

    return [...new Set(found)];
  } catch {
    return advertised ? [advertised] : [];
  }
}

/**
 * One tile.
 *
 * The icon is loaded **by the browser** rather than fetched and stored by
 * Steward. Vincent's browser is already on the LAN or the tailnet, so it can
 * reach these addresses when the server-side alternative would mean a fetch, a
 * cache and a disk. When every candidate fails it falls back to the initial,
 * which is why this is a client component.
 *
 * **One element, and which one depends on the mode.** Out of edit mode it is
 * the `<a>` it has always been. In edit mode it is a `<button>` that opens the
 * tile's dialog — the whole card, not a pencil in its corner.
 *
 * A first version put an always-visible pencil on every tile beside the link,
 * which meant restructuring the anchor into a wrapper, because an edit control
 * cannot be nested inside a link: interactive descendants of `<a>` are invalid
 * and browsers disagree about what to do with them. A mode removes the problem
 * rather than working around it — there is never a control inside the link,
 * because in edit mode there is no link.
 *
 * Props spread onto the root so `DialogTrigger asChild` can attach to it.
 */
export function Tile({
  tile,
  editing,
  ...props
}: {
  tile: LauncherTile;
  editing?: boolean;
} & React.ComponentProps<"button">) {
  const candidates = iconCandidates(tile.url, tile.icon);
  const [attempt, setAttempt] = useState(0);
  const icon = candidates[attempt];

  const shell =
    "flex min-w-0 items-center gap-[12px] rounded-[10px] border bg-card px-[12px] py-[12px] text-left transition-colors";

  const body = (
    <>
      <span className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-secondary">
        {icon ? (
          /* A LAN favicon cannot go through next/image: the optimizer runs on
             the server, which would make Steward fetch and cache every
             service's icon — a round trip and a disk for something the
             browser already has, and one that fails for anything only the
             browser can reach. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            // Keyed by the candidate so a failed attempt genuinely remounts
            // rather than leaving a broken image with a changed src.
            key={icon}
            src={icon}
            alt=""
            width={20}
            height={20}
            className="size-[20px] object-contain"
            onError={() => setAttempt((n) => n + 1)}
          />
        ) : (
          <span className="text-[15px] font-semibold text-muted-foreground">
            {tile.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 grow truncate text-[15px] font-medium">{tile.name}</span>

      {/*
        Rule 2 at the point it matters most. `status` is null whenever the Kuma
        collector is behind, so the dot is simply absent rather than green — a
        launcher is the surface used in a hurry, and a green dot on a dead
        service is the worst possible place for false reassurance.
      */}
      {editing ? (
        // The dot has nothing to say while you are arranging the page, and the
        // pencil says what pressing this does.
        <Pencil size={13} strokeWidth={1.8} className="shrink-0 text-faint" />
      ) : tile.status ? (
        <Dot tone={tile.status} role="img" aria-label={`${tile.name} is ${tile.status}`} />
      ) : null}
    </>
  );

  if (editing) {
    return (
      <button
        type="button"
        {...props}
        className={`${shell} cursor-pointer border-dashed hover:border-primary hover:bg-card-hover`}
      >
        {body}
      </button>
    );
  }

  return (
    <a href={tile.url} target="_blank" rel="noreferrer" className={`${shell} hover:bg-card-hover`}>
      {body}
    </a>
  );
}
