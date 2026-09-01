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

/**
 * The group order, as its **own** `Setting` row rather than a field inside the
 * tiles blob.
 *
 * `parse` below returns `[]` for anything that is not an array, so changing the
 * shape of `launcher:tiles` would silently erase every tile. A second key
 * cannot do that.
 *
 * **Absent is not empty.** Until a group is first moved or renamed there is no
 * row, and `orderGroups` falls back to the derivation that was the only
 * behaviour before 2026-09-01 — first appearance in the tile array. So nothing
 * reshuffles on the deploy that introduces this.
 */
export const LAUNCHER_GROUPS = "launcher:groups";

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

export async function readGroupOrder(): Promise<string[] | null> {
  const row = await prisma.setting.findUnique({ where: { key: LAUNCHER_GROUPS } });
  if (!row) return null;

  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === "string") : null;
  } catch {
    // Null, not []. An unreadable row means "no opinion", which falls back to
    // the derivation; an empty array would mean "no groups" and hide the lot.
    return null;
  }
}

export async function writeGroupOrder(groups: string[]): Promise<void> {
  const value = JSON.stringify(groups);
  await prisma.setting.upsert({
    where: { key: LAUNCHER_GROUPS },
    update: { value },
    create: { key: LAUNCHER_GROUPS, value },
  });
}

/** The group a tile belongs to, normalised the one way. */
export function groupOf(tile: { group: string }): string {
  return tile.group.trim() || "Other";
}

/**
 * Which groups exist, in which order.
 *
 * Two rules, and the second is the safety one:
 *
 * 1. **A stored order wins**, so a group can be moved without moving its tiles.
 *    A stored name with no tiles still appears — that is what lets a group be
 *    created before it is filled, and removed once it is emptied.
 * 2. **Any group a tile names but the list does not is appended.** A tile can
 *    never become invisible by naming a group nobody registered, which is the
 *    failure a stored list invites and the reason this is not a filter.
 *
 * With no stored list at all this is exactly the old derivation: first
 * appearance in the tile array.
 */
export function orderGroups(tiles: { group: string }[], stored: string[] | null): string[] {
  const named: string[] = [];
  for (const tile of tiles) {
    const name = groupOf(tile);
    if (!named.includes(name)) named.push(name);
  }

  if (stored === null) return named;

  return [...stored, ...named.filter((n) => !stored.includes(n))];
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
  const [tiles, stored, gate] = await Promise.all([readTiles(), readGroupOrder(), readGate(now)]);

  const named = tiles.filter((t) => t.monitor).map((t) => t.monitor as string);
  const monitors =
    named.length > 0 && !gate.stale
      ? await prisma.monitor.findMany({ where: { name: { in: named } } })
      : [];

  const status = new Map(monitors.map((m) => [m.name, m.status]));

  // Built from the order rather than from the tiles, so a group with nothing in
  // it still gets a heading — which is what makes it removable.
  const groups: LauncherGroup[] = orderGroups(tiles, stored).map((name) => ({
    name,
    tiles: tiles
      .filter((t) => groupOf(t) === name)
      .map((t) => ({ ...t, status: status.get(t.monitor ?? "") ?? null })),
  }));

  return { groups, count: tiles.length, statusUnknown: gate.stale };
}
