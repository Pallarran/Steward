"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { plannerFor, syncFamilyNudges } from "@/lib/family";
import type { SlotStatus } from "@/generated/prisma/enums";

const STATUSES: SlotStatus[] = ["open", "planning", "booked", "done"];

function refresh() {
  revalidatePath("/family");
  revalidatePath("/");
}

export type SlotFormState = { error: string | null; ok: string | null };

export async function addSlot(
  _prev: SlotFormState,
  formData: FormData,
): Promise<SlotFormState> {
  await requireAuth();

  const month = String(formData.get("month") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { error: "A month, as YYYY-MM.", ok: null };
  }

  const existing = await prisma.coupleSlot.findUnique({ where: { month } });
  if (existing) return { error: `${month} is already on the plan.`, ok: null };

  await prisma.coupleSlot.create({
    data: {
      month,
      // Whose turn it is follows the odd/even rule, and can be changed after —
      // they swap, and the planner document says they give each other slack.
      planner: String(formData.get("planner") ?? "").trim() || plannerFor(month),
      title: String(formData.get("title") ?? "").trim() || null,
    },
  });

  await syncFamilyNudges();
  refresh();
  return { error: null, ok: `Added ${month}.` };
}

export async function updateSlot(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const status = String(formData.get("status") ?? "");
  const eventDate = String(formData.get("eventDate") ?? "").trim();

  await prisma.coupleSlot.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || null,
      detail: String(formData.get("detail") ?? "").trim() || null,
      planner: String(formData.get("planner") ?? "").trim() || undefined,
      status: STATUSES.includes(status as SlotStatus) ? (status as SlotStatus) : undefined,
      // Noon, so a date typed as a calendar day cannot slip to the day before
      // when it is read back in a timezone behind UTC.
      eventDate: eventDate ? new Date(`${eventDate}T12:00:00`) : null,
    },
  });

  await syncFamilyNudges();
  refresh();
  redirect("/family");
}

export async function deleteSlot(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.coupleSlot.delete({ where: { id } }).catch(() => {});
  await syncFamilyNudges();
  refresh();
}

export async function addIdea(formData: FormData) {
  await requireAuth();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await prisma.idea.create({ data: { text } });
  await syncFamilyNudges();
  refresh();
}

/**
 * Uses an idea for a slot.
 *
 * The idea's text becomes the slot's plan and the idea leaves the bank —
 * `usedAt` rather than a delete, so what was used is still on record and the
 * bank only shows what is still available. The slot moves to `planning`,
 * because choosing what to do is not the same as having booked it.
 */
export async function useIdea(formData: FormData) {
  await requireAuth();

  const ideaId = String(formData.get("ideaId") ?? "");
  const slotId = String(formData.get("slotId") ?? "");
  if (!ideaId || !slotId) return;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return;

  await prisma.$transaction([
    prisma.coupleSlot.update({
      where: { id: slotId },
      data: { title: idea.text, status: "planning" },
    }),
    prisma.idea.update({ where: { id: ideaId }, data: { usedAt: new Date() } }),
  ]);

  await syncFamilyNudges();
  refresh();
  redirect("/family");
}

export async function deleteIdea(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.idea.delete({ where: { id } }).catch(() => {});
  await syncFamilyNudges();
  refresh();
}
