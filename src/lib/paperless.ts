import { request } from "@/lib/adapters/http";

const TIMEOUT_MS = 10_000;
const RESULTS = 10;

export type Found = {
  id: number;
  title: string;
  created: string | null;
  correspondent: string | null;
  type: string | null;
  url: string;
};

export function paperlessConfigured(): boolean {
  return Boolean(process.env.PAPERLESS_BASE_URL && process.env.PAPERLESS_TOKEN);
}

type PaperlessDocument = {
  id: number;
  title?: string | null;
  created?: string | null;
  correspondent?: number | null;
  document_type?: number | null;
};

type Named = { id: number; name?: string | null };

/**
 * Searches Paperless.
 *
 * **A deliberate, named exception to `docs/ARCHITECTURE.md` rule 1**, which
 * says no adapter is ever called from a page or a server component. A live
 * document search cannot be a collector without mirroring the entire archive
 * into Steward — a second document library, which PRD §5 explicitly says not to
 * build.
 *
 * The boundary is what makes the exception safe, and all three parts of it
 * matter:
 *
 * - It is **user-initiated**, never part of a render. The page renders in full
 *   with Paperless switched off.
 * - It returns **search results, never state**. Nothing from here is ever shown
 *   as current, so there is nothing for the staleness rule to protect.
 * - A failure is a message inside one section and cannot touch the other two.
 *
 * Returns null when Paperless is not configured, which the caller must render
 * as "not connected" rather than as no results.
 */
export async function searchDocuments(query: string): Promise<Found[] | null> {
  const base = process.env.PAPERLESS_BASE_URL;
  const token = process.env.PAPERLESS_TOKEN;
  if (!base || !token) return null;

  const url = new URL("/api/documents/", base);
  url.searchParams.set("query", query);
  url.searchParams.set("page_size", String(RESULTS));
  url.searchParams.set("ordering", "-created");

  const headers = { Authorization: `Token ${token}`, Accept: "application/json" };
  const response = await request(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Paperless rejected the token");
  }
  if (!response.ok) {
    throw new Error(`Paperless answered ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { results?: PaperlessDocument[] };
  const results = body.results ?? [];
  if (results.length === 0) return [];

  // Correspondents and types come back as ids. Both lists are small and
  // Paperless caches them, so two extra calls buy names for every result
  // rather than a column of numbers.
  const [correspondents, types] = await Promise.all([
    lookup(base, headers, "correspondents"),
    lookup(base, headers, "document_types"),
  ]);

  return results.map((doc) => ({
    id: doc.id,
    title: doc.title?.trim() || `Document ${doc.id}`,
    created: doc.created ?? null,
    correspondent: doc.correspondent === null ? null : (correspondents.get(doc.correspondent ?? -1) ?? null),
    type: doc.document_type === null ? null : (types.get(doc.document_type ?? -1) ?? null),
    url: new URL(`/documents/${doc.id}/details`, base).toString(),
  }));
}

/** Names by id. A failure here costs labels, never the search itself. */
async function lookup(
  base: string,
  headers: Record<string, string>,
  path: string,
): Promise<Map<number, string>> {
  try {
    const url = new URL(`/api/${path}/`, base);
    url.searchParams.set("page_size", "200");

    const response = await request(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return new Map();

    const body = (await response.json()) as { results?: Named[] };
    return new Map((body.results ?? []).flatMap((r) => (r.name ? [[r.id, r.name] as const] : [])));
  } catch {
    return new Map();
  }
}
