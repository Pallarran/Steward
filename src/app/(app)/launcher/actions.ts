"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  discoverIcon,
  groupOf,
  newTileId,
  orderGroups,
  readGroupOrder,
  readTiles,
  writeGroupOrder,
  writeTiles,
  type Tile,
} from "@/lib/launcher";

/**
 * The launcher manages itself.
 *
 * These lived under `settings/actions.ts` until 2026-09-01. Moved rather than
 * duplicated, for the reason subscriptions moved to Finance: two surfaces
 * editing one record drift, and a change to one is a change somebody has to
 * remember to make twice.
 */

export type Result = { error: string | null };

function refresh() {
  revalidatePath("/launcher");
}

/* ------------------------------------------------------------------ tiles */

/**
 * One action for adding and editing, the shape every dialog in the app uses:
 * a bare `FormData` in, `{ error }` out, and a hidden `id` deciding which.
 *
 * **The address is only checked for being a URL, never fetched.** Unlike a
 * feed, which Steward has to read on a schedule and which is worth proving
 * before it is saved, a tile is a link Vincent clicks — and half of these
 * services are behind Tailscale or asleep, so a reachability test would refuse
 * perfectly good tiles for being off at that moment.
 */
export async function saveTile(formData: FormData): Promise<Result> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const group = String(formData.get("group") ?? "").trim() || "Other";
  const monitor = String(formData.get("monitor") ?? "").trim() || null;

  if (!name || !rawUrl) return { error: "A name and an address, at least." };

  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`;
  try {
    new URL(url);
  } catch {
    return { error: "That does not look like a web address." };
  }

  const tiles = await readTiles();

  // **Excluding itself.** The address is the uniqueness key, so without this a
  // tile whose address did not change rejects itself on save — and the failure
  // looks exactly like a button that does nothing.
  if (tiles.some((t) => t.url === url && t.id !== id)) {
    return { error: "There is already a tile for that address." };
  }

  if (id) {
    const existing = tiles.find((t) => t.id === id);
    if (!existing) return { error: "That tile is gone." };

    // The icon is rediscovered only when the address changed. Refetching every
    // save would make renaming a tile depend on a service being awake.
    const icon = existing.url === url ? existing.icon : await discoverIcon(url);

    await writeTiles(
      tiles.map((t) => (t.id === id ? { ...t, name, url, group, monitor, icon } : t)),
    );
  } else {
    const tile: Tile = { id: newTileId(), name, url, group, monitor, icon: await discoverIcon(url) };
    await writeTiles([...tiles, tile]);
  }

  // A new group name typed into the dialog has to join the order, or it lands
  // at the end by the append rule and can never be moved.
  await registerGroup(group);

  refresh();
  return { error: null };
}

export async function deleteTile(id: string) {
  await requireAuth();
  if (!id) return;

  const tiles = await readTiles();
  await writeTiles(tiles.filter((t) => t.id !== id));
  refresh();
}

/**
 * One step, within the tile's own group.
 *
 * **Group-aware since 2026-09-01.** It used to swap two elements of the flat
 * array with no idea groups existed, so moving a tile past a group boundary
 * left its `group` unchanged but landed it earlier in the array — which, back
 * when a group's position was its first tile's position, silently reordered the
 * headings. Groups have their own order now, and this stays inside one.
 */
export async function moveTile(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const tiles = await readTiles();
  const tile = tiles.find((t) => t.id === id);
  if (!tile) return;

  const siblings = tiles.filter((t) => groupOf(t) === groupOf(tile));
  const at = siblings.findIndex((t) => t.id === id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= siblings.length) return;

  // Swap the two tiles at their positions in the *global* array, found through
  // the group's own ordering. The array stays the storage; the group is a view.
  const a = tiles.findIndex((t) => t.id === siblings[at].id);
  const b = tiles.findIndex((t) => t.id === siblings[to].id);

  const reordered = [...tiles];
  [reordered[a], reordered[b]] = [reordered[b], reordered[a]];
  await writeTiles(reordered);

  refresh();
}

/**
 * Ask every service where its icon is.
 *
 * Concurrent and unbounded, which is fine for a dozen. A service that is down
 * keeps the icon it has rather than losing it, so running this while something
 * is asleep costs nothing.
 */
export async function refreshIcons() {
  await requireAuth();

  const tiles = await readTiles();
  const found = await Promise.all(tiles.map((t) => discoverIcon(t.url)));

  await writeTiles(tiles.map((t, i) => ({ ...t, icon: found[i] ?? t.icon })));
  refresh();
}

/* ----------------------------------------------------------------- groups */

/** Puts a name in the order if it is not already there, at the end. */
async function registerGroup(name: string): Promise<void> {
  const tiles = await readTiles();
  const stored = await readGroupOrder();
  const order = orderGroups(tiles, stored);

  if (!order.includes(name)) order.push(name);
  await writeGroupOrder(order);
}

export async function addGroup(formData: FormData): Promise<Result> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A name, at least." };

  const order = orderGroups(await readTiles(), await readGroupOrder());
  if (order.includes(name)) return { error: `There is already a group called ${name}.` };

  await writeGroupOrder([...order, name]);
  refresh();
  return { error: null };
}

/**
 * Rename, and take the tiles with it.
 *
 * **The tiles are written first.** Two rows have to change and there is no
 * transaction across them, so the order decides what a failure between them
 * leaves behind: tiles-then-order means a rename that half-succeeded has moved
 * the tiles under a name the order does not list, and the append rule in
 * `orderGroups` renders it anyway. Order-first would have orphaned every tile
 * under a heading that no longer exists.
 */
export async function renameGroup(formData: FormData): Promise<Result> {
  await requireAuth();

  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("name") ?? "").trim();

  if (!from || !to) return { error: "A name, at least." };
  if (from === to) return { error: null };

  const tiles = await readTiles();
  const order = orderGroups(tiles, await readGroupOrder());

  if (order.includes(to)) return { error: `There is already a group called ${to}.` };

  await writeTiles(tiles.map((t) => (groupOf(t) === from ? { ...t, group: to } : t)));
  await writeGroupOrder(order.map((g) => (g === from ? to : g)));

  refresh();
  return { error: null };
}

export async function moveGroup(formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!name || (direction !== "up" && direction !== "down")) return;

  const order = orderGroups(await readTiles(), await readGroupOrder());
  const at = order.indexOf(name);
  const to = direction === "up" ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= order.length) return;

  const reordered = [...order];
  [reordered[at], reordered[to]] = [reordered[to], reordered[at]];
  await writeGroupOrder(reordered);

  refresh();
}

/**
 * Only an empty one.
 *
 * A group with tiles in it has no meaning to delete — either the tiles go with
 * it, which is a destructive act wearing a tidying-up name, or they survive
 * under a heading that comes straight back through the append rule. The dialog
 * offers this only when the group is empty and says why when it is not.
 */
export async function deleteGroup(name: string) {
  await requireAuth();
  if (!name) return;

  const tiles = await readTiles();
  if (tiles.some((t) => groupOf(t) === name)) return;

  const order = orderGroups(tiles, await readGroupOrder());
  await writeGroupOrder(order.filter((g) => g !== name));

  refresh();
}
