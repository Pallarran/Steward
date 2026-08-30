"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { deleteSession, validateSession } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/require-auth";
import { closeTodoistTask } from "@/lib/adapters/todoist";

export async function logout() {
  const session = await validateSession();
  if (session) await deleteSession(session.id);
  redirect("/login");
}

/**
 * Dismissal is only for items where "gone" is true and final — a read article,
 * a notification you have taken in. A still-due task is ticked, never
 * dismissed: hiding it would create a private notion of "cleared" that Todoist
 * does not share, and the two would drift.
 *
 * The row is kept rather than deleted, so the adapter that produced it does
 * not simply re-create it on the next run: `(source, externalId)` still
 * matches, and a dismissed item stays dismissed.
 */
export async function dismissItem(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.item.update({
    where: { id },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  revalidatePath("/");
}

/**
 * Ticks a task due today. Closes it in Todoist first and only then drops the
 * local row: if Todoist refuses, the task stays on the card rather than
 * vanishing from a list Todoist still considers open. Steward never holds an
 * opinion about completion that Todoist does not share.
 */
export async function tickTask(formData: FormData) {
  await requireAuth();

  const externalId = String(formData.get("externalId") ?? "");
  if (!externalId) return;

  await closeTodoistTask(externalId);
  await prisma.task.deleteMany({ where: { externalId } });

  revalidatePath("/");
}

/**
 * Ticks a Todoist Inbox item sitting in the queue.
 *
 * Rule 3: tasks get ticked, not dismissed. The row is then marked dismissed so
 * it leaves the queue at once, which is honest here because the task really is
 * complete — the next poll will not return it either.
 */
export async function tickItem(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.source !== "todoist") return;

  await closeTodoistTask(item.externalId);
  await prisma.item.update({
    where: { id },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  revalidatePath("/");
}
