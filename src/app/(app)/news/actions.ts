"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { discoverFeed } from "@/lib/feeds/discover";

/**
 * Reading clears an article.
 *
 * Rule 3 permits it here and almost nowhere else: a read article is genuinely
 * gone, finally and forever, in a way a still-due task never is. Setting
 * `readAt` rather than deleting keeps the row, so the collector's
 * `(feedId, externalId)` still matches and the article cannot come back unread
 * the next time the publisher re-lists it.
 */
export async function markRead(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.article.updateMany({
    // updateMany, so an article already read or already deleted is a no-op
    // rather than a thrown error in the middle of a click.
    where: { id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/news");
}

/**
 * Puts one article back.
 *
 * **The asymmetry this fixes:** marking a whole topic read has offered an undo
 * bar since it was built, while clearing a single article — the far commoner
 * act, and the one done by mistake — offered nothing at all. `readAt` is a
 * nullable column, so the row can trivially come back, and the app's own rule
 * is *undo where the row can come back, confirm where it cannot*.
 *
 * A separate action rather than a toggle, so an article read three days ago is
 * never resurrected by a stray click on a row that no longer shows it.
 */
export async function unreadArticle(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.article.updateMany({
    where: { id, readAt: { not: null } },
    data: { readAt: null },
  });

  revalidatePath("/news");
}

/**
 * The whole topic at once, which is how a skim actually ends — and undoable,
 * which is what makes it safe to press.
 *
 * Vincent's words on the first version: "a Mark all read button I'm scared to
 * test because I don't want to empty the list". That is a defect rather than a
 * nerve. `CLAUDE.md`'s reversibility rule covers bulk edits, and one click
 * silently clearing everything unread is a bulk edit.
 *
 * Every article in the batch is stamped with the **same** `readAt`, which makes
 * the batch addressable afterwards: the undo matches on that exact timestamp,
 * so it restores precisely what this click cleared and nothing read before or
 * since. The stamp travels back in the URL, so nothing new is stored to hold a
 * few seconds of regret.
 */
export async function markTopicRead(formData: FormData) {
  await requireAuth();

  const topicId = String(formData.get("topicId") ?? "");
  if (!topicId) return;

  const at = new Date();
  const { count } = await prisma.article.updateMany({
    where: { topicId, readAt: null },
    data: { readAt: at },
  });

  revalidatePath("/news");
  redirect(`/news?cleared=${count}&at=${encodeURIComponent(at.toISOString())}&topic=${topicId}`);
}

/** Puts back exactly the batch that `at` identifies. */
export async function undoTopicRead(formData: FormData) {
  await requireAuth();

  const topicId = String(formData.get("topicId") ?? "");
  const at = String(formData.get("at") ?? "");
  if (!topicId || !at) return;

  const stamp = new Date(at);
  if (Number.isNaN(stamp.getTime())) return;

  await prisma.article.updateMany({
    where: { topicId, readAt: stamp },
    data: { readAt: null },
  });

  revalidatePath("/news");
  redirect("/news");
}

/* --------------------------------------------------------------- sources */

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

  revalidatePath("/news");
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
  revalidatePath("/news");
}

export async function deleteFeed(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.feed.delete({ where: { id } }).catch(() => {});
  revalidatePath("/news");
}

/**
 * Renames a topic.
 *
 * There was no way to. The only path was delete-and-recreate, which cascades
 * every feed and every article they had collected — so a typo in a topic name
 * cost the archive. `name` is unique, so a collision reports rather than
 * silently merging two topics into one.
 */
export async function renameTopic(formData: FormData): Promise<{ error: string | null }> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "A topic needs a name." };

  const clash = await prisma.topic.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `There is already a topic called ${name}.` };

  await prisma.topic.update({ where: { id }, data: { name } });
  revalidatePath("/news");
  return { error: null };
}

/**
 * Moves a topic up or down the page.
 *
 * `Topic.position` has existed since the model was written, is assigned on
 * create, is what `readNews` orders by — and its own schema comment claims
 * "manual ordering on the News page and in settings", which was true in
 * neither. It decided the order topics appear in and could only be changed by
 * editing the database.
 *
 * A swap with the neighbour rather than a re-index: two rows written, and the
 * gaps a deleted topic leaves behind cannot accumulate into a wrong answer
 * because nothing depends on the numbers being contiguous.
 */
export async function moveTopic(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const topic = await prisma.topic.findUnique({ where: { id } });
  if (!topic) return;

  const neighbour = await prisma.topic.findFirst({
    where:
      direction === "up"
        ? { position: { lt: topic.position } }
        : { position: { gt: topic.position } },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });

  // Already at the end. Nothing to swap with, and no error either — the button
  // that got here is simply not offered in that position.
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.topic.update({ where: { id: topic.id }, data: { position: neighbour.position } }),
    prisma.topic.update({ where: { id: neighbour.id }, data: { position: topic.position } }),
  ]);

  revalidatePath("/news");
}
