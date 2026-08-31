import { prisma } from "@/lib/db/prisma";

/**
 * The cheat-sheet — facts worth writing down and never remembering.
 *
 * All that is left of this module since subscriptions moved to
 * `subscriptions.ts` on 2026-09-01. Paperless was never here: it lives in
 * `paperless.ts` and is reached only from the page's own action, which is the
 * one named exception to rule 1.
 */

export type CheatSheetRow = Awaited<ReturnType<typeof prisma.cheatSheetEntry.findMany>>[number];

export type CheatSheetArea = { area: string; entries: CheatSheetRow[] };

export async function readCheatSheet(): Promise<CheatSheetArea[]> {
  const entries = await prisma.cheatSheetEntry.findMany({
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });

  const areas: CheatSheetArea[] = [];
  for (const entry of entries) {
    const area = entry.area.trim() || "Other";
    let group = areas.find((g) => g.area === area);
    if (!group) {
      group = { area, entries: [] };
      areas.push(group);
    }
    group.entries.push(entry);
  }

  return areas;
}
