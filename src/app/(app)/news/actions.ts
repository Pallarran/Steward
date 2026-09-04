"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";

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
