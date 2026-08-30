import { prisma } from "@/lib/db/prisma";
import { STALE_MULTIPLE } from "@/lib/systems";
import type { SourceKey } from "@/generated/prisma/enums";

const LABELS: Partial<Record<SourceKey, string>> = {
  kuma: "Uptime Kuma",
  todoist: "Todoist",
  ha: "Home Assistant",
};

export type CollectorState = {
  source: SourceKey;
  label: string;
  asOf: Date | null;
  stale: boolean;
};

export type Collectors = {
  all: CollectorState[];
  stale: CollectorState[];
  /** The oldest successful run: a dashboard is only as current as its slowest source. */
  oldest: Date | null;
};

/**
 * Every collector's freshness in one read.
 *
 * This is what the sidebar's clock shows. It exists so the panels do not each
 * have to carry a timestamp on a normal day — they announce staleness when it
 * is theirs, and this line carries the always-ticking proof that anything is
 * running at all.
 */
export async function readCollectors(now: Date = new Date()): Promise<Collectors> {
  const rows = await prisma.sourceStatus.findMany({ orderBy: { source: "asc" } });

  const all: CollectorState[] = rows.map((r) => ({
    source: r.source,
    label: LABELS[r.source] ?? r.source,
    asOf: r.lastSuccessAt,
    stale:
      r.lastSuccessAt === null ||
      now.getTime() - r.lastSuccessAt.getTime() > r.intervalSeconds * STALE_MULTIPLE * 1000,
  }));

  const stamps = all.map((c) => c.asOf).filter((d): d is Date => d !== null);

  return {
    all,
    stale: all.filter((c) => c.stale),
    oldest: stamps.length > 0 ? stamps.reduce((a, b) => (a < b ? a : b)) : null,
  };
}
