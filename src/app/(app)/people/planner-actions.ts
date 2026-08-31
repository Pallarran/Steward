"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { mineFor } from "@/lib/couple";
import { syncPeopleNudges } from "@/lib/people";
import type { SlotStatus } from "@/generated/prisma/enums";
import type { Result } from "./actions";

/**
 * The couple planner's actions. A separate file from `actions.ts` because it is
 * a separate subject — months and ideas rather than people — and one action
 * module of twenty exports would read worse than two of nine and seven.
 */
const STATUSES: SlotStatus[] = ["open", "planning", "booked", "done"];

function refresh() {
  revalidatePath("/people");
  revalidatePath("/");
}

export async function saveSlot(formData: FormData): Promise<Result> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "A month, as YYYY-MM." };

  const clash = await prisma.coupleSlot.findFirst({
    where: { month, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `${month} is already on the plan.` };

  const status = String(formData.get("status") ?? "") as SlotStatus;
  const eventDate = String(formData.get("eventDate") ?? "").trim();

  const data = {
    month,
    // Whose turn defaults to the odd/even rule and is then editable, because
    // the planner's own text says they give each other slack.
    mine: formData.get("mine") === "mine",
    title: String(formData.get("title") ?? "").trim() || null,
    detail: String(formData.get("detail") ?? "").trim() || null,
    status: STATUSES.includes(status) ? status : ("open" as SlotStatus),
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? new Date(`${eventDate}T12:00:00`) : null,
  };

  if (id) {
    await prisma.coupleSlot.update({ where: { id }, data });
  } else {
    await prisma.coupleSlot.create({ data: { ...data, mine: data.mine || mineFor(month) } });
  }

  await syncPeopleNudges();
  refresh();
  return { error: null };
}

export async function deleteSlot(id: string): Promise<Result> {
  await requireAuth();
  if (!id) return { error: "No month to remove." };

  await prisma.coupleSlot.delete({ where: { id } }).catch(() => {});
  await syncPeopleNudges();
  refresh();
  return { error: null };
}

/** `personId` scopes an idea to someone's own bank; absent is the couple's. */
export async function addIdea(formData: FormData) {
  await requireAuth();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  await prisma.idea.create({
    data: { text, personId: String(formData.get("personId") ?? "").trim() || null },
  });

  await syncPeopleNudges();
  refresh();
}

export async function deleteIdea(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.idea.delete({ where: { id } }).catch(() => {});
  await syncPeopleNudges();
  refresh();
}

/**
 * Uses an idea for a month.
 *
 * The idea's text becomes the plan and it leaves the bank — `usedAt` rather
 * than a delete, so the bank shows what is still available without losing what
 * was used. The month moves to `planning`, because choosing what to do is not
 * the same as having booked it.
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

  await syncPeopleNudges();
  refresh();
}

/** The same, for a person's own bank: the idea becomes their next plan. */
export async function usePersonIdea(formData: FormData) {
  await requireAuth();

  const ideaId = String(formData.get("ideaId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!ideaId || !personId) return;

  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return;

  await prisma.$transaction([
    prisma.person.update({ where: { id: personId }, data: { planTitle: idea.text } }),
    prisma.idea.update({ where: { id: ideaId }, data: { usedAt: new Date() } }),
  ]);

  await syncPeopleNudges();
  refresh();
}
