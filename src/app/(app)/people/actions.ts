"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { syncPeopleNudges } from "@/lib/people";

export type PersonFormState = { error: string | null; ok: string | null };

export async function addPerson(
  _prev: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A name, at least.", ok: null };

  const relation = String(formData.get("relation") ?? "").trim() || null;
  const intention = String(formData.get("intention") ?? "").trim() || null;

  // Blank means no ceiling, which is a real choice: some people are worth
  // keeping in view without a clock on them.
  const raw = String(formData.get("cadenceDays") ?? "").trim();
  const cadenceDays = raw ? Number(raw) : null;
  if (cadenceDays !== null && (!Number.isFinite(cadenceDays) || cadenceDays < 1)) {
    return { error: "A ceiling is a number of days, or blank for none.", ok: null };
  }

  const last = await prisma.person.findFirst({ orderBy: { position: "desc" } });

  await prisma.person.create({
    data: {
      name,
      relation,
      intention,
      cadenceDays: cadenceDays === null ? null : Math.round(cadenceDays),
      position: (last?.position ?? -1) + 1,
    },
  });

  revalidatePath("/people");
  return { error: null, ok: `Added ${name}.` };
}

/**
 * Records contact, keeping what the date was.
 *
 * The previous value is kept so a mis-tap is undoable. Without it one wrong
 * press silently destroys the real date, and there is no source to recover it
 * from — this list exists nowhere else.
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

  // The nudge goes because the thing it asked for happened — not because it
  // was dismissed. Immediately, rather than at tomorrow's run, so the queue
  // agrees with the page you are looking at.
  await syncPeopleNudges();

  revalidatePath("/people");
  revalidatePath("/");
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

  revalidatePath("/people");
  revalidatePath("/");
  redirect("/people");
}

export async function updatePerson(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const raw = String(formData.get("cadenceDays") ?? "").trim();
  const cadenceDays = raw ? Math.round(Number(raw)) : null;

  await prisma.person.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      relation: String(formData.get("relation") ?? "").trim() || null,
      intention: String(formData.get("intention") ?? "").trim() || null,
      cadenceDays:
        cadenceDays !== null && Number.isFinite(cadenceDays) && cadenceDays > 0
          ? cadenceDays
          : null,
    },
  });

  await syncPeopleNudges();
  revalidatePath("/people");
  redirect("/people");
}

export async function deletePerson(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.person.delete({ where: { id } }).catch(() => {});
  await syncPeopleNudges();

  revalidatePath("/people");
  revalidatePath("/");
}
