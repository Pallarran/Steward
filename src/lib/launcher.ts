import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { readGate } from "@/lib/systems";
import { request } from "@/lib/adapters/http";
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
  /** The icon the service's own page advertises. Null when it was not found. */
  icon: string | null;
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

    // Normalized rather than merely filtered, so a tile written before a field
    // existed reads as that field's default instead of undefined.
    return parsed
      .filter(
        (t) =>
          t !== null &&
          typeof t === "object" &&
          typeof t.id === "string" &&
          typeof t.name === "string" &&
          typeof t.url === "string",
      )
      .map((t) => ({
        id: t.id as string,
        name: t.name as string,
        url: t.url as string,
        group: typeof t.group === "string" ? t.group : "Other",
        monitor: typeof t.monitor === "string" && t.monitor ? t.monitor : null,
        icon: typeof t.icon === "string" && t.icon ? t.icon : null,
      }));
  } catch {
    return [];
  }
}

const ICON_TIMEOUT_MS = 6000;
const UA = "Steward/1.0 (personal dashboard; one reader)";

/**
 * Asks the service where its icon is, rather than guessing.
 *
 * Guessing was tried and failed twice on Vincent's own machine: Jellyfin keeps
 * its favicon under `/web/`, and a Next.js app built the way Steward is serves
 * `/icon.png` and no `/favicon.ico` at all. There is no list of paths that
 * covers a self-hosted estate — but every one of these pages states the answer
 * in a `<link rel="icon">`.
 *
 * **Best-effort, and never fatal.** A service that is asleep, behind Tailscale
 * or slow returns null, the tile still saves, and the browser falls back to the
 * common paths and then to the initial. That is why this does not turn adding a
 * tile into a reachability test — the tile is a link Vincent clicks, and it must
 * be addable while the thing it points at is off.
 */
export async function discoverIcon(url: string): Promise<string | null> {
  try {
    const response = await request(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(ICON_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return null;

    // The head is where link tags live; a large SPA payload is not worth reading.
    const html = (await response.text()).slice(0, 200_000);
    const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);

    // apple-touch-icon first: it is a real image at a usable size, where a
    // classic favicon is often a 16px .ico that renders muddy at 20px.
    for (const wanted of [/rel=["']?apple-touch-icon/i, /rel=["'][^"']*\bicon\b/i]) {
      for (const tag of tags) {
        if (!wanted.test(tag)) continue;
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
        if (!href) continue;
        try {
          return new URL(href, response.url || url).toString();
        } catch {
          // A malformed href is not worth failing the whole tile over.
        }
      }
    }

    return null;
  } catch {
    return null;
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
