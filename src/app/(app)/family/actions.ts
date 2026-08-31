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

/** `kidId` scopes the idea to a girl's bank; absent means the couple's. */
export async function addIdea(formData: FormData) {
  await requireAuth();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await prisma.idea.create({
    data: { text, kidId: String(formData.get("kidId") ?? "").trim() || null },
  });

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

/* ----------------------------------------------------------------- girls */

export async function addKid(formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const raw = String(formData.get("cadenceDays") ?? "").trim();
  const cadence = raw ? Math.round(Number(raw)) : null;

  const last = await prisma.kid.findFirst({ orderBy: { position: "desc" } });

  await prisma.kid.create({
    data: {
      name,
      cadenceDays: cadence !== null && Number.isFinite(cadence) && cadence > 0 ? cadence : null,
      position: (last?.position ?? -1) + 1,
    },
  });

  await syncFamilyNudges();
  refresh();
}

export async function updateKid(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const raw = String(formData.get("cadenceDays") ?? "").trim();
  const cadence = raw ? Math.round(Number(raw)) : null;
  const planDate = String(formData.get("planDate") ?? "").trim();

  await prisma.kid.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      planTitle: String(formData.get("planTitle") ?? "").trim() || null,
      // Noon, so a calendar day cannot slip backwards when read in a timezone
      // behind UTC.
      planDate: planDate ? new Date(`${planDate}T12:00:00`) : null,
      cadenceDays: cadence !== null && Number.isFinite(cadence) && cadence > 0 ? cadence : null,
    },
  });

  await syncFamilyNudges();
  refresh();
  redirect("/family");
}

/**
 * The outing happened.
 *
 * Records when, and **clears the plan** — so the card always shows what is
 * next rather than what already was, which is the question the mockup asks.
 * The plan's own date is used where there is one, because a Saturday marked
 * done on Monday happened on the Saturday.
 */
export async function completeOuting(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const kid = await prisma.kid.findUnique({ where: { id } });
  if (!kid) return;

  await prisma.kid.update({
    where: { id },
    data: { lastOutingAt: kid.planDate ?? new Date(), planTitle: null, planDate: null },
  });

  await syncFamilyNudges();
  refresh();
  redirect("/family");
}

export async function deleteKid(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Her ideas go with her: the schema cascades, because an idea for a girl who
  // is no longer listed has nowhere to be used.
  await prisma.kid.delete({ where: { id } }).catch(() => {});
  await syncFamilyNudges();
  refresh();
}

/** Uses an idea from a girl's own bank as her next plan. */
export async function useKidIdea(formData: FormData) {
  await requireAuth();

  const ideaId = String(formData.get("ideaId") ?? "");
  const kidId = String(formData.get("kidId") ?? "");
  if (!ideaId || !kidId) return;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return;

  await prisma.$transaction([
    prisma.kid.update({ where: { id: kidId }, data: { planTitle: idea.text } }),
    prisma.idea.update({ where: { id: ideaId }, data: { usedAt: new Date() } }),
  ]);

  await syncFamilyNudges();
  refresh();
  redirect("/family");
}
