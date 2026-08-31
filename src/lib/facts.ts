import { prisma } from "@/lib/db/prisma";
import type { SourceKey } from "@/generated/prisma/enums";

/**
 * Small current-state facts, in `SystemFact`.
 *
 * State rather than arrivals — an unavailable-entity count, the pending-update
 * split, a portfolio summary. None belongs in `Item`, which records things that
 * arrived and need clearing, and none earns a model of its own.
 *
 * These began as JSON in `Setting`. `docs/ARCHITECTURE.md` set the threshold
 * for promoting them at "a second source starts writing facts", and Horizon is
 * that second source. The table earns its place with two columns `Setting`
 * could not carry: **who** wrote the fact and **when it was true** — which is
 * not the same as when it was written, and the difference is the whole reason a
 * finance panel can say "Friday's close" instead of "now".
 */

export type Fact<T> = { value: T; source: SourceKey; at: Date };

export async function writeFact(
  key: string,
  source: SourceKey,
  value: unknown,
  at: Date = new Date(),
): Promise<void> {
  const data = { value: value as object, source, at };

  await prisma.systemFact.upsert({
    where: { key },
    update: data,
    create: { key, ...data },
  });
}

/**
 * Null when the fact has never been written.
 *
 * Callers must render that as **not collected**, never as a zero. A check that
 * never ran must not look like a check that passed — rule 2, at the point it is
 * easiest to get wrong.
 */
export async function readFact<T>(key: string): Promise<Fact<T> | null> {
  const row = await prisma.systemFact.findUnique({ where: { key } });
  if (!row) return null;

  return { value: row.value as T, source: row.source, at: row.at };
}
