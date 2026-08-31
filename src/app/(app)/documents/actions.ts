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
