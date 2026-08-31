"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { syncPeopleNudges } from "@/lib/people";
import type { PersonKind } from "@/generated/prisma/enums";

/**
 * Actions return `{ error }` rather than throwing, and take a bare `FormData`
 * rather than `(prev, formData)`.
 *
 * The dialogs call them directly inside a transition and close on a clean
 * result. `useActionState` would need an effect to close, and
 * `react-hooks/set-state-in-effect` already caught this project once on the
 * theme toggle.
 */
export type Result = { error: string | null };

const KINDS: PersonKind[] = ["spouse", "child", "contact"];

function refresh() {
  revalidatePath("/people");
  revalidatePath("/");
}

function days(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Math.round(Number(trimmed));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Noon, so a calendar day cannot slip backwards in a timezone behind UTC. */
function date(raw: string): Date | null {
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T12:00:00`) : null;
}

function fields(formData: FormData) {
  const kind = String(formData.get("kind") ?? "contact") as PersonKind;

  return {
    name: String(formData.get("name") ?? "").trim(),
    kind: KINDS.includes(kind) ? kind : "contact",
    circle: String(formData.get("circle") ?? "").trim() || null,
    relation: String(formData.get("relation") ?? "").trim() || null,
    intention: String(formData.get("intention") ?? "").trim() || null,
    cadenceDays: days(String(formData.get("cadenceDays") ?? "")),
  };
}

export async function savePerson(formData: FormData): Promise<Result> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const data = fields(formData);

  if (!data.name) return { error: "A name, at least." };

  // One spouse. Two would make "whose month is it" unanswerable, and the
  // couple planner reads the first one it finds — better to refuse than to
  // silently pick.
  if (data.kind === "spouse") {
    const existing = await prisma.person.findFirst({
      where: { kind: "spouse", ...(id ? { NOT: { id } } : {}) },
      select: { name: true },
    });
    if (existing) {
      return { error: `${existing.name} is already recorded as your spouse.` };
    }
  }

  if (id) {
    await prisma.person.update({ where: { id }, data });
  } else {
    const last = await prisma.person.findFirst({ orderBy: { position: "desc" } });
    await prisma.person.create({ data: { ...data, position: (last?.position ?? -1) + 1 } });
  }

  await syncPeopleNudges();
  refresh();
  return { error: null };
}

/**
 * Confirmed rather than undoable — the schema cascades their ideas away with
 * them, and there is no source to re-fetch a person from. Steward's rule: undo
 * where the row can come back, confirm where it cannot.
 */
export async function deletePerson(id: string): Promise<Result> {
  await requireAuth();
  if (!id) return { error: "Nobody to remove." };

  await prisma.person.delete({ where: { id } }).catch(() => {});
  await syncPeopleNudges();
  refresh();
  return { error: null };
}

/**
 * Records contact, keeping what the date was.
 *
 * The previous value survives so a mis-tap is undoable. Without it one wrong
 * press silently destroys the real date, and this list exists nowhere else to
 * recover it from.
 */
export async function recordContact(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return;

  await prisma.person.update({
    where: { id },
    data: { previousContactAt: person.lastContactAt, lastContactAt: new Date() },
  });

  // Immediately, not at tomorrow's run, so the queue agrees with the page you
  // are looking at.
  await syncPeopleNudges();
  refresh();
  redirect(`/people?contacted=${id}`);
}

export async function undoContact(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return;

  await prisma.person.update({
    where: { id },
    data: { lastContactAt: person.previousContactAt, previousContactAt: null },
  });

  await syncPeopleNudges();
  refresh();
  redirect("/people");
}

/* --------------------------------------------------------------- a plan */

export async function savePlan(formData: FormData): Promise<Result> {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Nobody to plan with." };

  await prisma.person.update({
    where: { id },
    data: {
      planTitle: String(formData.get("planTitle") ?? "").trim() || null,
      planDate: date(String(formData.get("planDate") ?? "")),
    },
  });

  await syncPeopleNudges();
  refresh();
  return { error: null };
}

/**
 * It happened.
 *
 * Records when and **clears the plan**, so the card shows what is next rather
 * than what already was. The plan's own date wins where there is one: a
 * Saturday ticked on Monday happened on the Saturday.
 */
export async function completePlan(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) return;

  await prisma.person.update({
    where: { id },
    data: {
      previousContactAt: person.lastContactAt,
      lastContactAt: person.planDate ?? new Date(),
      planTitle: null,
      planDate: null,
    },
  });

  await syncPeopleNudges();
  refresh();
  redirect(`/people?contacted=${id}`);
}
