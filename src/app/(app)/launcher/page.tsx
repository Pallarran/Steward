import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { readLauncher } from "@/lib/launcher";
import { Tile } from "@/components/launcher/tile";

export const metadata = { title: "Launcher · Steward" };

/**
 * Tiles to the real apps, where action happens — PRD §3.1.
 *
 * Deliberately the last thing built. It is the least valuable piece and the
 * most tempting to start with, so `docs/BUILD-PLAN.md` moved it from the PRD's
 * step 3 to the end.
 *
 * What it has that a page of bookmarks does not: a tile bound to an Uptime Kuma
 * monitor carries that service's real status, from data Steward already holds.
 */
export default async function LauncherPage() {
  await requireAuth();

  const { groups, count, statusUnknown } = await readLauncher();

  return (
    <>
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">Launcher</h1>
          <p className="text-[13px] text-muted-foreground">
            {count === 0
              ? "no tiles yet"
              : `${count} ${count === 1 ? "tile" : "tiles"} across ${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
          </p>
        </div>

        {count > 0 && statusUnknown ? (
          <span className="font-mono text-[11px] text-warning">
            Uptime Kuma is behind — no status shown
          </span>
        ) : null}
      </header>

      {count === 0 ? (
        <div className="flex grow flex-col items-center justify-center gap-[9px] rounded-[10px] border bg-card py-[64px] text-center">
          <p className="text-[17px] font-semibold">Nothing here yet</p>
          <p className="max-w-[440px] text-[13px] leading-[1.6] text-muted-foreground">
            Tiles are the way out to the real apps — Jellyfin, Unraid, Home Assistant, Todoist.
            Add them in <Link href="/settings" className="text-primary hover:underline">settings</Link>,
            and bind one to an Uptime Kuma monitor to give it a live status dot.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.name} className="flex flex-col gap-[11px]">
            <h2 className="text-[15px] font-semibold">{group.name}</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[10px]">
              {group.tiles.map((tile) => (
                <Tile key={tile.id} tile={tile} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
