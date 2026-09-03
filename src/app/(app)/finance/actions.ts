"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { syncSubscriptionNudges } from "@/lib/subscriptions";
import type { SubscriptionCadence } from "@/generated/prisma/enums";

const CADENCES: SubscriptionCadence[] = ["weekly", "monthly", "quarterly", "yearly"];

/**
 * The currencies a subscription may be billed in.
 *
 * `Subscription.currency` is a free `String` with a CAD default, so this is the
 * only thing standing between a hand-crafted form post and a row nothing can
 * convert. Two, because two is what Horizon holds a rate for.
 */
const CURRENCIES = ["CAD", "USD"];

function refresh() {
  revalidatePath("/finance");
  // The queue too: a renewal nudge is an Item, and saving a subscription can
  // create or clear one on the spot.
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

/**
 * One action for adding and editing, taking a bare `FormData` and returning
 * `{ error }` — the shape the dialogs call directly inside a transition, and
 * the same one `savePerson` uses.
 *
 * The two used to be separate: an inline `useActionState` form for adding and a
 * `<details>` disclosure holding nine fields for editing, on the one page that
 * never adopted the dialog pattern the rest of the app settled on.
 */
export type Result = { error: string | null };

export async function saveSubscription(formData: FormData): Promise<Result> {
  await requireAuth();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const amountCents = toCents(String(formData.get("amount") ?? ""));
  const renewsOn = String(formData.get("renewsOn") ?? "").trim();
  const cadence = String(formData.get("cadence") ?? "monthly") as SubscriptionCadence;
  const currency = String(formData.get("currency") ?? "CAD").toUpperCase();

  if (!name) return { error: "A name, at least." };
  if (amountCents === null) return { error: "The amount has to be a number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewsOn)) {
    return { error: "A renewal date — any one of them, past or future." };
  }

  const data = {
    name,
    amountCents,
    // In the shared `data` object, so `create` and `update` both carry it. A
    // field written only on create is the mistake `lib/priority.ts` records
    // having been made twice.
    currency: CURRENCIES.includes(currency) ? currency : "CAD",
    cadence: CADENCES.includes(cadence) ? cadence : ("monthly" as SubscriptionCadence),
    // Noon, so a calendar day cannot slip backwards when it is read in a
    // timezone behind UTC.
    renewsOn: new Date(`${renewsOn}T12:00:00Z`),
    card: String(formData.get("card") ?? "").trim() || null,
    cancelUrl: String(formData.get("cancelUrl") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    noticeDays: toDays(String(formData.get("noticeDays") ?? "")),
  };

  if (id) await prisma.subscription.update({ where: { id }, data });
  else await prisma.subscription.create({ data });

  await syncSubscriptionNudges();
  refresh();
  return { error: null };
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
