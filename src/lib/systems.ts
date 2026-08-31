import { prisma } from "@/lib/db/prisma";
import { readCollectors, STALE_MULTIPLE, type CollectorState } from "@/lib/collectors";
import { readFact } from "@/lib/facts";
import {
  HA_UNAVAILABLE,
  HA_UPDATES,
  type UnavailableFact,
  type UpdatesFact,
} from "@/lib/adapters/ha";

/** Re-exported for the callers that read staleness without reading the gate. */
export { STALE_MULTIPLE };

export type GateProblem =
  | { kind: "down"; name: string; since: Date }
  | { kind: "stale"; collector: string; lastSuccessAt: Date | null };

export type Gate = {
  /** `clear` is the only state that is allowed to look reassuring. */
  state: "clear" | "problems";
  /** Drives the "as of" stamp. Null means the collector has never succeeded. */
  asOf: Date | null;
  stale: boolean;
  monitorsUp: number;
  monitorsTotal: number;
  problems: GateProblem[];
};

export async function readGate(now: Date = new Date()): Promise<Gate> {
  const status = await prisma.sourceStatus.findUnique({ where: { source: "kuma" } });

  const intervalSeconds = status?.intervalSeconds ?? 60;
  const staleAfterMs = intervalSeconds * STALE_MULTIPLE * 1000;
  const lastSuccessAt = status?.lastSuccessAt ?? null;
  const stale =
    lastSuccessAt === null || now.getTime() - lastSuccessAt.getTime() > staleAfterMs;

  // When the collector is stale we do not know the current state of anything,
  // so the gate says exactly that and says nothing about the services. Down and
  // stale are said differently on purpose: down names the service, stale blames
  // the collector.
  if (stale) {
    return {
      state: "problems",
      asOf: lastSuccessAt,
      stale: true,
      monitorsUp: 0,
      monitorsTotal: 0,
      problems: [{ kind: "stale", collector: "Uptime Kuma", lastSuccessAt }],
    };
  }

  // Only monitors present in the most recent successful poll count. One deleted
  // in Kuma stops being seen and quietly drops out rather than haunting the
  // gate forever.
  const monitors = await prisma.monitor.findMany({
    where: { seenAt: { gte: lastSuccessAt } },
    orderBy: { changedAt: "asc" },
  });

  const down = monitors.filter((m) => m.status === "down");

  return {
    state: down.length === 0 ? "clear" : "problems",
    asOf: lastSuccessAt,
    stale: false,
    monitorsUp: monitors.filter((m) => m.status === "up").length,
    monitorsTotal: monitors.length,
    problems: down.map((m) => ({ kind: "down", name: m.name, since: m.changedAt })),
  };
}

export type MonitorRow = Awaited<ReturnType<typeof prisma.monitor.findMany>>[number];

export type Systems = {
  kuma: {
    stale: boolean;
    asOf: Date | null;
    monitors: MonitorRow[];
    up: number;
    down: number;
  };
  ha: {
    stale: boolean;
    asOf: Date | null;
    /** Null in both cases means the check has never run — not that it found nothing. */
    updates: UpdatesFact | null;
    unavailable: UnavailableFact | null;
  };
  collectors: CollectorState[];
};

/**
 * Everything the Systems page shows, in one read.
 *
 * Per-source staleness, like the Today card: Uptime Kuma failing must not make
 * the Home Assistant section look wrong, and each section says for itself
 * whether its own data can be trusted.
 *
 * What is deliberately **not** here: Unraid, Home Assistant's persistent
 * notifications, and its repairs. None is collected — Unraid has no read path
 * and the other two are WebSocket-only — so the page names them as not
 * connected. Returning zero for a check that was never made is the silent lie
 * rule 2 exists to prevent, and it would be a very comfortable one.
 */
export async function readSystems(now: Date = new Date()): Promise<Systems> {
  // Both come from facts rather than from the queue's `Item` rows, because
  // dismissal must not change them. The queue asks "does this need you?", and
  // dismissing answers no; this page asks "what is true?", and an update waved
  // past in the queue is still an update that is waiting.
  const [collectors, unavailable, updates] = await Promise.all([
    readCollectors(now),
    readFact<UnavailableFact>(HA_UNAVAILABLE),
    readFact<UpdatesFact>(HA_UPDATES),
  ]);

  const kuma = collectors.all.find((c) => c.source === "kuma") ?? null;
  const ha = collectors.all.find((c) => c.source === "ha") ?? null;

  // Only monitors from the last successful poll, for the same reason the gate
  // uses: one deleted in Kuma should drop out rather than haunt the page.
  const monitors =
    kuma?.asOf && !kuma.stale
      ? await prisma.monitor.findMany({
          where: { seenAt: { gte: kuma.asOf } },
          // Down first: the page is read top-down and the problem goes first.
          // Postgres sorts an enum by its declaration order, and MonitorStatus
          // is declared down, up, pending, maintenance — so this holds only as
          // long as `down` stays first in the schema.
          orderBy: [{ status: "asc" }, { name: "asc" }],
        })
      : [];

  return {
    kuma: {
      stale: kuma?.stale ?? true,
      asOf: kuma?.asOf ?? null,
      monitors,
      up: monitors.filter((m) => m.status === "up").length,
      down: monitors.filter((m) => m.status === "down").length,
    },
    ha: {
      stale: ha?.stale ?? true,
      asOf: ha?.asOf ?? null,
      updates,
      unavailable,
    },
    collectors: collectors.all,
  };
}

/**
 * Whether any collector is currently stale.
 *
 * The queue's empty state asks this before congratulating anyone: an empty
 * queue with a failing collector is a failed load wearing an achievement's
 * clothes.
 */
export async function anyCollectorStale(now: Date = new Date()): Promise<boolean> {
  const statuses = await prisma.sourceStatus.findMany();

  // No collectors configured yet is not the same as a broken one.
  if (statuses.length === 0) return false;

  return statuses.some(
    (s) =>
      s.lastSuccessAt === null ||
      now.getTime() - s.lastSuccessAt.getTime() > s.intervalSeconds * STALE_MULTIPLE * 1000,
  );
}
