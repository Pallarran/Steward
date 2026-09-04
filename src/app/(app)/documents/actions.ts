"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { paperlessConfigured, searchDocuments, type Found } from "@/lib/paperless";

function refresh() {
  revalidatePath("/documents");
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

/**
 * Takes an id, not a `FormData`, because `ConfirmDialog` hands it one — and it
 * needs a confirm dialog more than anything else in the app deletes with.
 *
 * **The cheat-sheet is the one store in Steward with no source to re-fetch
 * from.** Every other delete is a row an adapter will write again on its next
 * run, or a record that came from Todoist or Gmail or Horizon. This is typed by
 * hand, once, and the paint colour is gone. It nonetheless shipped behind a
 * single unconfirmed 28px click while `/settings`, `/people` and `/finance` all
 * confirmed — the rule in `shared/confirm-dialog.tsx` names exactly this case
 * and it was the only one not following it.
 */
export async function deleteEntry(id: string) {
  await requireAuth();
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
