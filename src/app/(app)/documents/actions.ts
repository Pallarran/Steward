"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { syncSubscriptionNudges } from "@/lib/documents";
import { paperlessConfigured, searchDocuments, type Found } from "@/lib/paperless";
import type { SubscriptionCadence } from "@/generated/prisma/enums";

const CADENCES: SubscriptionCadence[] = ["weekly", "monthly", "quarterly", "yearly"];

function refresh() {
  revalidatePath("/documents");
  revalidatePath("/");
}

/** Dollars as typed, to integer cents. Rejects anything that is not a number. */
function toCents(raw: string): number | null {
  const amount = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function toDays(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const days = Math.round(Number(trimmed));
  return Number.isFinite(days) && days >= 0 ? days : null;
}

/* --------------------------------------------------------- subscriptions */

export type SubscriptionFormState = { error: string | null; ok: string | null };

export async function addSubscription(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const amountCents = toCents(String(formData.get("amount") ?? ""));
  const renewsOn = String(formData.get("renewsOn") ?? "").trim();
  const cadence = String(formData.get("cadence") ?? "monthly") as SubscriptionCadence;

  if (!name) return { error: "A name, at least.", ok: null };
  if (amountCents === null) return { error: "The amount has to be a number.", ok: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewsOn)) {
    return { error: "A renewal date — any one of them, past or future.", ok: null };
  }

  await prisma.subscription.create({
    data: {
      name,
      amountCents,
      cadence: CADENCES.includes(cadence) ? cadence : "monthly",
      // Noon, so a calendar day cannot slip backwards when it is read in a
      // timezone behind UTC.
      renewsOn: new Date(`${renewsOn}T12:00:00Z`),
      card: String(formData.get("card") ?? "").trim() || null,
      cancelUrl: String(formData.get("cancelUrl") ?? "").trim() || null,
      noticeDays: toDays(String(formData.get("noticeDays") ?? "")) ?? 10,
    },
  });

  await syncSubscriptionNudges();
  refresh();
  return { error: null, ok: `Added ${name}.` };
}

export async function updateSubscription(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const amountCents = toCents(String(formData.get("amount") ?? ""));
  const renewsOn = String(formData.get("renewsOn") ?? "").trim();
  const cadence = String(formData.get("cadence") ?? "") as SubscriptionCadence;

  await prisma.subscription.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      amountCents: amountCents ?? undefined,
      cadence: CADENCES.includes(cadence) ? cadence : undefined,
      renewsOn: /^\d{4}-\d{2}-\d{2}$/.test(renewsOn)
        ? new Date(`${renewsOn}T12:00:00Z`)
        : undefined,
      card: String(formData.get("card") ?? "").trim() || null,
      cancelUrl: String(formData.get("cancelUrl") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      noticeDays: toDays(String(formData.get("noticeDays") ?? "")),
    },
  });

  await syncSubscriptionNudges();
  refresh();
  redirect("/documents");
}

/**
 * Cancelled, not deleted.
 *
 * The record of what it cost and when it renewed is worth keeping — that is
 * most of the value of having written it down. Its queue row goes on the next
 * sync, without a dismissal, because the thing it warned about is no longer
 * going to happen.
 */
export async function toggleSubscription(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) return;

  await prisma.subscription.update({ where: { id }, data: { active: !sub.active } });
  await syncSubscriptionNudges();
  refresh();
}

export async function deleteSubscription(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.subscription.delete({ where: { id } }).catch(() => {});
  await syncSubscriptionNudges();
  refresh();
}

/* ----------------------------------------------------------- cheat-sheet */

export async function addEntry(formData: FormData) {
  await requireAuth();

  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!label || !value) return;

  const last = await prisma.cheatSheetEntry.findFirst({ orderBy: { position: "desc" } });

  await prisma.cheatSheetEntry.create({
    data: {
      area: String(formData.get("area") ?? "").trim() || "Other",
      label,
      value,
      secret: formData.get("secret") === "on",
      position: (last?.position ?? -1) + 1,
    },
  });

  refresh();
}

export async function deleteEntry(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.cheatSheetEntry.delete({ where: { id } }).catch(() => {});
  refresh();
}

/* ------------------------------------------------------------- paperless */

/**
 * Only async functions may be exported from a `"use server"` file, so the
 * initial state lives with the form that uses it. Types are erased, so they
 * are fine here.
 */
export type SearchState = {
  query: string;
  results: Found[] | null;
  error: string | null;
  connected: boolean;
};

/**
 * The rule-1 exception, and the only place in Steward that reaches a source
 * from the UI. `src/lib/paperless.ts` carries the reasoning and the boundary.
 */
export async function search(_prev: SearchState, formData: FormData): Promise<SearchState> {
  await requireAuth();

  const connected = paperlessConfigured();
  const query = String(formData.get("query") ?? "").trim();

  if (!connected) return { query, results: null, error: null, connected };
  if (!query) return { query, results: null, error: null, connected };

  try {
    return { query, results: await searchDocuments(query), error: null, connected };
  } catch (err) {
    return {
      query,
      results: null,
      error: err instanceof Error ? err.message : "Paperless did not answer",
      connected,
    };
  }
}
