import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/shell/section";
import { EmptyState } from "@/components/shell/empty-state";
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
      <PageHeader
        title="Launcher"
        subtitle={
          count === 0
            ? "no tiles yet"
            : `${count} ${count === 1 ? "tile" : "tiles"} across ${groups.length} ${groups.length === 1 ? "group" : "groups"}`
        }
        action={
          count > 0 && statusUnknown ? (
            <span className="font-mono text-[11px] text-warning">
              Uptime Kuma is behind — no status shown
            </span>
          ) : null
        }
      />

      {count === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nothing here yet"
          description={
            <>
              Tiles are the way out to the real apps — Jellyfin, Unraid, Home Assistant, Todoist.
              Add them in{" "}
              <Link href="/settings" className="text-primary hover:underline">
                settings
              </Link>
              , and bind one to an Uptime Kuma monitor to give it a live status dot.
            </>
          }
        />
      ) : (
        groups.map((group) => (
          <Section key={group.name} title={group.name}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[10px]">
              {group.tiles.map((tile) => (
                <Tile key={tile.id} tile={tile} />
              ))}
            </div>
          </Section>
        ))
      )}
    </>
  );
}
