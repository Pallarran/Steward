"use client";

import { useState } from "react";
import type { LauncherTile } from "@/lib/launcher";

const TONE = {
  up: "var(--teal)",
  down: "var(--destructive)",
  pending: "var(--warning)",
  maintenance: "var(--blue)",
} as const;

/**
 * One tile.
 *
 * The icon is the service's own favicon, loaded **by the browser** rather than
 * fetched and stored by Steward. Vincent's browser is already on the LAN or the
 * tailnet, so it can reach these addresses when the server-side alternative
 * would mean a fetch, a cache and a disk. When it fails — plenty of services
 * serve no favicon at the root — it falls back to the initial, which is why
 * this is a client component.
 */
export function Tile({ tile }: { tile: LauncherTile }) {
  const [iconFailed, setIconFailed] = useState(false);

  let favicon: string | null = null;
  try {
    favicon = new URL("/favicon.ico", tile.url).toString();
  } catch {
    favicon = null;
  }

  return (
    <a
      href={tile.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-[12px] rounded-[10px] border bg-card px-[14px] py-[13px] transition-colors hover:bg-card-hover"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-secondary">
        {favicon && !iconFailed ? (
          /* A LAN favicon cannot go through next/image: the optimizer runs on
             the server, which would make Steward fetch and cache every
             service's icon — a round trip and a disk for something the
             browser already has, and one that fails for anything only the
             browser can reach. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={favicon}
            alt=""
            width={20}
            height={20}
            className="size-[20px]"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span className="text-[14px] font-semibold text-muted-foreground">
            {tile.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 grow truncate text-[14px] font-medium">{tile.name}</span>

      {/*
        Rule 2 at the point it matters most. `status` is null whenever the Kuma
        collector is behind, so the dot is simply absent rather than green — a
        launcher is the surface used in a hurry, and a green dot on a dead
        service is the worst possible place for false reassurance.
      */}
      {tile.status ? (
        <span
          className="size-[7px] shrink-0 rounded-full"
          style={{ background: TONE[tile.status] }}
          role="img"
          aria-label={`${tile.name} is ${tile.status}`}
        />
      ) : null}
    </a>
  );
}
