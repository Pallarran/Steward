import { prisma } from "@/lib/db/prisma";

/**
 * Rule 2, in one function: nothing is ever shown as current when it is stale.
 *
 * A collector that has not succeeded within three times its interval is stale.
 * "Never run" counts as stale too — an empty panel is never a healthy one.
 */
export const STALE_MULTIPLE = 3;

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
