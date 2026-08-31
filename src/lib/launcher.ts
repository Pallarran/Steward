import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { readGate } from "@/lib/systems";
import type { MonitorStatus } from "@/generated/prisma/enums";

/**
 * The launcher's tiles.
 *
 * Stored in `Setting` and managed on the settings page rather than committed to
 * a file, for two reasons. The repo is public and every tile is a LAN address.
 * And it is the same lesson step 9 learned about feeds: a list written once
 * rots, because services move and get replaced faster than anyone edits a
 * config file and redeploys.
 */
export const LAUNCHER_TILES = "launcher:tiles";

export type Tile = {
  id: string;
  name: string;
  url: string;
  /** Free text. Tiles are grouped by it, in the order the groups first appear. */
  group: string;
  /** An Uptime Kuma monitor name, so a tile can carry the status Steward holds. */
  monitor: string | null;
};

export type LauncherGroup = { name: string; tiles: LauncherTile[] };

export type LauncherTile = Tile & {
  /** Null when the tile names no monitor, or when the gate cannot be trusted. */
  status: MonitorStatus | null;
};

export type Launcher = {
  groups: LauncherGroup[];
  count: number;
  /** True when Uptime Kuma is behind, so no tile shows a status it cannot back up. */
  statusUnknown: boolean;
};

function parse(value: string): Tile[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tile =>
        t !== null &&
        typeof t === "object" &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.url === "string",
    );
  } catch {
    return [];
  }
}

export async function readTiles(): Promise<Tile[]> {
  const row = await prisma.setting.findUnique({ where: { key: LAUNCHER_TILES } });
  return row ? parse(row.value) : [];
}

export async function writeTiles(tiles: Tile[]): Promise<void> {
  const value = JSON.stringify(tiles);
  await prisma.setting.upsert({
    where: { key: LAUNCHER_TILES },
    update: { value },
    create: { key: LAUNCHER_TILES, value },
  });
}

export function newTileId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * The launcher page's read: tiles grouped, each carrying the status Uptime Kuma
 * already knows.
 *
 * That status is the one thing Steward's launcher has that Homepage's does not
 * come by honestly — and it obeys rule 2 like everything else. **When the Kuma
 * collector is stale, every tile's status goes to null** rather than showing
 * the last state it happened to see. A green dot on a dead service is precisely
 * the false reassurance the staleness rule exists to prevent, and a launcher is
 * the worst place for it: it is the surface Vincent uses when he is in a hurry.
 */
export async function readLauncher(now: Date = new Date()): Promise<Launcher> {
  const [tiles, gate] = await Promise.all([readTiles(), readGate(now)]);

  const named = tiles.filter((t) => t.monitor).map((t) => t.monitor as string);
  const monitors =
    named.length > 0 && !gate.stale
      ? await prisma.monitor.findMany({ where: { name: { in: named } } })
      : [];

  const status = new Map(monitors.map((m) => [m.name, m.status]));

  const groups: LauncherGroup[] = [];
  for (const tile of tiles) {
    const name = tile.group.trim() || "Other";
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, tiles: [] };
      groups.push(group);
    }
    group.tiles.push({ ...tile, status: status.get(tile.monitor ?? "") ?? null });
  }

  return { groups, count: tiles.length, statusUnknown: gate.stale };
}
