"use server";

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

/** The whole topic at once, which is how a skim actually ends. */
export async function markTopicRead(formData: FormData) {
  await requireAuth();

  const topicId = String(formData.get("topicId") ?? "");
  if (!topicId) return;

  await prisma.article.updateMany({
    where: { topicId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/news");
}
