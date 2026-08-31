"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { discoverFeed } from "@/lib/feeds/discover";
import { discoverIcon, newTileId, readTiles, writeTiles, type Tile } from "@/lib/launcher";

export type FeedFormState = { error: string | null; ok: string | null; input?: string };

export async function addTopic(formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const last = await prisma.topic.findFirst({ orderBy: { position: "desc" } });

  await prisma.topic.upsert({
    where: { name },
    update: {},
    create: { name, position: (last?.position ?? -1) + 1 },
  });

  revalidatePath("/settings");
}

/**
 * Deleting a topic takes its feeds and their articles with it — the schema
 * cascades. That is deliberate: a feed with no topic has nowhere to be ranked
 * or read, so an orphan would be a row that exists and does nothing.
 */
export async function deleteTopic(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.topic.delete({ where: { id } }).catch(() => {});
  revalidatePath("/settings");
  revalidatePath("/news");
}

/**
 * Adds a feed from whatever was pasted — a site, a YouTube channel, a Steam
 * game page.
 *
 * The feed is discovered and **fetched** before the row is written, so a
 * source that does not work is never saved. The input comes back with the
 * error so a typo can be corrected rather than retyped.
 */
export async function addFeed(
  _prev: FeedFormState,
  formData: FormData,
): Promise<FeedFormState> {
  await requireAuth();

  const input = String(formData.get("input") ?? "").trim();
  const topicId = String(formData.get("topicId") ?? "");

  if (!input) return { error: null, ok: null };
  if (!topicId) return { error: "Pick a topic first.", ok: null, input };

  let found;
  try {
    found = await discoverFeed(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read that.", ok: null, input };
  }

  const existing = await prisma.feed.findUnique({ where: { url: found.url } });
  if (existing) {
    return { error: `Already added as "${existing.title}".`, ok: null, input };
  }

  await prisma.feed.create({
    data: {
      topicId,
      url: found.url,
      input,
      title: found.title,
      kind: found.kind,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/news");
  return { error: null, ok: `Added ${found.title} — ${found.entries} items in it now.` };
}

/** Muting keeps the URL. A feed that is noisy this month may not be next. */
export async function toggleFeed(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) return;

  await prisma.feed.update({ where: { id }, data: { enabled: !feed.enabled } });
  revalidatePath("/settings");
  revalidatePath("/news");
}

export async function deleteFeed(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.feed.delete({ where: { id } }).catch(() => {});
  revalidatePath("/settings");
  revalidatePath("/news");
}

/* ------------------------------------------------------------- launcher */

export type TileFormState = { error: string | null; ok: string | null };

/**
 * Adds a launcher tile.
 *
 * The address is only checked for being a URL, not fetched. Unlike a feed,
 * which Steward has to read on a schedule and which is worth proving before it
 * is saved, a tile is a link Vincent clicks — and half of these services are
 * behind Tailscale or asleep, so a reachability test would refuse perfectly
 * good tiles for being off at that moment.
 */
export async function addTile(
  _prev: TileFormState,
  formData: FormData,
): Promise<TileFormState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const group = String(formData.get("group") ?? "").trim() || "Other";
  const monitor = String(formData.get("monitor") ?? "").trim() || null;

  if (!name || !rawUrl) return { error: "A name and an address, at least.", ok: null };

  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`;
  try {
    new URL(url);
  } catch {
    return { error: "That does not look like a web address.", ok: null };
  }

  const tiles = await readTiles();
  if (tiles.some((t) => t.url === url)) {
    return { error: "There is already a tile for that address.", ok: null };
  }

  // Best-effort and never fatal: a sleeping service simply gets no icon.
  const icon = await discoverIcon(url);

  const tile: Tile = { id: newTileId(), name, url, group, monitor, icon };
  await writeTiles([...tiles, tile]);

  revalidatePath("/settings");
  revalidatePath("/launcher");
  return {
    error: null,
    ok: icon
      ? `Added ${name} to ${group}.`
      : `Added ${name} to ${group} — no icon found, so it shows its initial. Refresh icons once it is awake.`,
  };
}

/**
 * Re-asks every service where its icon is.
 *
 * Needed because a tile can be added while its service is asleep, and because
 * an app that changes its icon should be allowed to say so without the tile
 * being deleted and re-added.
 */
export async function refreshIcons() {
  await requireAuth();

  const tiles = await readTiles();
  const found = await Promise.all(tiles.map((t) => discoverIcon(t.url)));

  // A service that is down now keeps the icon it had, rather than losing it.
  await writeTiles(tiles.map((t, i) => ({ ...t, icon: found[i] ?? t.icon })));

  revalidatePath("/settings");
  revalidatePath("/launcher");
}

export async function deleteTile(id: string) {
  await requireAuth();
  if (!id) return;

  const tiles = await readTiles();
  await writeTiles(tiles.filter((t) => t.id !== id));

  revalidatePath("/settings");
  revalidatePath("/launcher");
}

/** Reordering is by one step, which is enough to arrange a grid of a dozen. */
export async function moveTile(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const tiles = await readTiles();
  const index = tiles.findIndex((t) => t.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= tiles.length) return;

  const reordered = [...tiles];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await writeTiles(reordered);

  revalidatePath("/settings");
  revalidatePath("/launcher");
}
