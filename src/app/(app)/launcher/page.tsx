import { LayoutGrid, Pencil, Plus, Settings2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/shell/section";
import { EmptyState } from "@/components/shell/empty-state";
import { IconButton } from "@/components/shell/icon-button";
import { Button } from "@/components/ui/button";
import { readLauncher } from "@/lib/launcher";
import { Tile } from "@/components/launcher/tile";
import { TileDialog } from "./tile-dialog";
import { GroupDialog } from "./group-dialog";
import { refreshIcons } from "./actions";

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
 *
 * **It manages itself since 2026-09-01.** Adding, editing, reordering and the
 * icon refresh all moved here from Settings rather than being duplicated: two
 * surfaces editing one record drift, and a change to one is a change somebody
 * has to remember to make twice. Same call as subscriptions moving to Finance.
 */
export default async function LauncherPage() {
  await requireAuth();

  const [{ groups, count, statusUnknown }, monitorRows] = await Promise.all([
    readLauncher(),
    prisma.monitor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const names = groups.map((g) => g.name);
  const monitors = monitorRows.map((m) => m.name);

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
          <div className="flex items-center gap-[10px]">
            {count > 0 && statusUnknown ? (
              <span className="font-mono text-[11px] text-warning">
                Uptime Kuma is behind — no status shown
              </span>
            ) : null}

            {/*
              Secondary rather than ghost, and the same reasoning as its
              previous home on Settings: this is a repair control, gone looking
              for when a tile shows its initial, and the first version was a
              faint label Vincent could not find at all.
            */}
            {count > 0 ? (
              <form action={refreshIcons}>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  title="Ask every service where its icon is. Anything asleep keeps the icon it has."
                >
                  Refresh icons
                </Button>
              </form>
            ) : null}

            <GroupDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-faint">
                  <Plus size={13} strokeWidth={2} />
                  Group
                </Button>
              }
            />

            <TileDialog
              groups={names}
              monitors={monitors}
              trigger={
                <Button size="sm">
                  <Plus size={13} strokeWidth={2} />
                  Tile
                </Button>
              }
            />
          </div>
        }
      />

      {count === 0 && groups.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nothing here yet"
          description="Tiles are the way out to the real apps — Jellyfin, Unraid, Home Assistant, Todoist. Bind one to an Uptime Kuma monitor and it carries that service's live status."
        >
          <TileDialog
            groups={names}
            monitors={monitors}
            trigger={
              <Button>
                <Plus size={14} strokeWidth={2} />
                Add a tile
              </Button>
            }
          />
        </EmptyState>
      ) : (
        groups.map((group) => (
          <Section
            key={group.name}
            title={group.name}
            action={
              <span className="flex items-center gap-[2px]">
                <TileDialog
                  groups={names}
                  monitors={monitors}
                  defaultGroup={group.name}
                  trigger={
                    <IconButton type="button" aria-label={`Add a tile to ${group.name}`} title="Add a tile">
                      <Plus size={14} strokeWidth={2} />
                    </IconButton>
                  }
                />

                <GroupDialog
                  name={group.name}
                  tileCount={group.tiles.length}
                  trigger={
                    <IconButton type="button" aria-label={`Edit the ${group.name} group`} title="Edit group">
                      <Settings2 size={14} strokeWidth={1.8} />
                    </IconButton>
                  }
                />
              </span>
            }
          >
            {group.tiles.length === 0 ? (
              // A group can exist before anything is in it. Saying so beats an
              // empty grid that looks like a rendering fault.
              <p className="text-[13px] leading-[1.6] text-muted-foreground">
                Nothing in this group yet.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[10px]">
                {group.tiles.map((tile) => (
                  <Tile
                    key={tile.id}
                    tile={tile}
                    edit={
                      <TileDialog
                        tile={tile}
                        groups={names}
                        monitors={monitors}
                        trigger={
                          <IconButton
                            type="button"
                            aria-label={`Edit ${tile.name}`}
                            title="Edit"
                            className="shrink-0"
                          >
                            <Pencil size={13} strokeWidth={1.8} />
                          </IconButton>
                        }
                      />
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        ))
      )}
    </>
  );
}
