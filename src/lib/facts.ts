import { prisma } from "@/lib/db/prisma";

/**
 * Small current-state facts, stored as JSON in `Setting`.
 *
 * A deliberate and bounded compromise. An unavailable-entity count is current
 * state rather than an arriving item, so it does not belong in `Item`; and one
 * number does not earn a model of its own. If a second fact like it ever
 * appears, both should be promoted to a `SystemFact` table rather than a third
 * key being added here.
 */
export async function writeFact(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);

  await prisma.setting.upsert({
    where: { key },
    update: { value: serialized },
    create: { key, value: serialized },
  });
}

/**
 * Null when the fact has never been written, or no longer parses.
 *
 * Callers must treat null as "not collected" and say so, never as a zero —
 * rule 2: a check that was never made must not render as a check that passed.
 */
export async function readFact<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}
