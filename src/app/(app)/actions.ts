"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { deleteSession, validateSession } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/require-auth";

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
