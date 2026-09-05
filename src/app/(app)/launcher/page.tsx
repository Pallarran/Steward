import Link from "next/link";
import { Check, LayoutGrid, Pencil, Plus, Settings2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/shell/section";
import { NotKnown } from "@/components/shell/not-known";
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
 * surfaces editing one record drift. Same call as subscriptions to Finance.
 *
 * **Editing is a mode, and the mode is the URL.** `?edit=1`, not client state:
 * the page is a server component reading the database, so a search param needs
 * no client wrapper around the grid, survives every server action's revalidate
 * without being re-established, and can be left by pressing Back.
 *
 * The first version had no mode — an always-visible pencil on every tile — and
 * put a control on every card of a page whose whole job is one clean click.
 * **Adding is deliberately not in the mode**: it lives at the top and is always
 * reachable, because adding a tile is a thing you decide to do, where editing
 * one is a thing you go looking for.
 */
export default async function LauncherPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireAuth();

  const [{ edit }, { groups, count, statusUnknown }, monitorRows] = await Promise.all([
    searchParams,
    readLauncher(),
    prisma.monitor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const editing = edit === "1";
  const names = groups.map((g) => g.name);
  const monitors = monitorRows.map((m) => m.name);

  return (
    <>
      <PageHeader
        title="Launcher"
        subtitle={
          editing
            ? "arranging — press a tile or a group to change it"
            : count === 0
              ? "no tiles yet"
              : `${count} ${count === 1 ? "tile" : "tiles"} across ${groups.length} ${groups.length === 1 ? "group" : "groups"}`
        }
        action={
          <div className="flex items-center gap-[10px]">
            {/* Shown while arranging too, from 2026-09-04. It was gated on
                `!editing`, which hid the explanation for the missing dots at
                exactly the moment you are looking at the tiles and wondering
                where they went. */}
            {count > 0 && statusUnknown ? (
              <span className="font-mono text-[12px] text-warning">
                Uptime Kuma is behind — no status shown
              </span>
            ) : null}

            {/*
              Only while arranging. It is a repair control — gone looking for
              when a tile shows its initial — not something wanted on the page
              you open to click one thing.
            */}
            {editing && count > 0 ? (
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
                <Button variant="secondary" size="sm">
                  <Plus size={13} strokeWidth={2} />
                  Group
                </Button>
              }
            />

            <TileDialog
              groups={names}
              monitors={monitors}
              trigger={
                <Button variant="secondary" size="sm">
                  <Plus size={13} strokeWidth={2} />
                  Tile
                </Button>
              }
            />

            <Button asChild variant={editing ? "default" : "secondary"} size="sm">
              <Link href={editing ? "/launcher" : "/launcher?edit=1"}>
                {editing ? (
                  <>
                    <Check size={13} strokeWidth={2} />
                    Done
                  </>
                ) : (
                  <>
                    <Pencil size={13} strokeWidth={1.8} />
                    Arrange
                  </>
                )}
              </Link>
            </Button>
          </div>
        }
      />

      {/* On `count === 0` alone. It was `count === 0 && groups.length === 0`,
          so making a group before adding your first tile took away the only
          prominent "Add a tile" button on the page and left the faint ghost in
          the header — the empty state disappearing at the exact moment it was
          still needed. */}
      {count === 0 ? (
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
        /*
          **Groups flow into columns, from 2026-09-05.**

          Each group was its own `Section` with its own `auto-fill` grid, so
          every group started a new row and every group's last row ended in dead
          columns — a four-tile group at 1616px drew four tiles and about 680px
          of nothing, and the waste repeated per group. Vincent's words were
          that it gets messy with several groups and a lot of space is lost, and
          both are the same fault: the layout was per-group when it needed to be
          per-page.

          `columns` packs them. A short group sits under the one above it
          instead of costing a row of its own, and there is no ragged row-end
          anywhere because a group is now one column-wide block rather than a
          grid. `break-inside-avoid` keeps a group whole; the tiles inside it
          are a stack, which the host line added last week reads better in than
          a 227px square did.
        */
        <div className="columns-[340px] gap-x-[16px]">
          {groups.map((group) => (
            <Section
              className="mb-[20px] break-inside-avoid"
            key={group.name}
            title={group.name}
            action={
              editing ? (
                <GroupDialog
                  name={group.name}
                  tileCount={group.tiles.length}
                  trigger={
                    <IconButton
                      type="button"
                      aria-label={`Edit the ${group.name} group`}
                      title="Rename, move or remove this group"
                    >
                      <Settings2 size={14} strokeWidth={1.8} />
                    </IconButton>
                  }
                />
              ) : null
            }
          >
            {group.tiles.length === 0 ? (
              // A group can exist before anything is in it. Saying so beats an
              // empty grid that looks like a rendering fault.
              <NotKnown>
                Nothing in this group yet.
              </NotKnown>
            ) : (
              // A stack, not a grid of its own. The column is already the
              // layout; a grid inside it is the per-group waste again, one
              // level down.
              <div className="flex flex-col gap-[6px]">
                {group.tiles.map((tile) =>
                  editing ? (
                    <TileDialog
                      key={tile.id}
                      tile={tile}
                      groups={names}
                      monitors={monitors}
                      trigger={<Tile tile={tile} editing />}
                    />
                  ) : (
                    <Tile key={tile.id} tile={tile} />
                  ),
                )}
              </div>
            )}
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
