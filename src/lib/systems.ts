import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { readCollectors, STALE_MULTIPLE, type CollectorState } from "@/lib/collectors";
import { readFact } from "@/lib/facts";
import { outageStats, WINDOW_DAYS, type OutageStats } from "@/lib/service";
import {
  HA_UNAVAILABLE,
  HA_UPDATES,
  type UnavailableFact,
  type UpdatesFact,
} from "@/lib/adapters/ha";
import {
  UNRAID_ARRAY,
  UNRAID_PARITY,
  type ArrayFact,
  type ParityFact,
} from "@/lib/adapters/unraid";
import {
  SERVER_HARDWARE,
  SERVER_VITALS,
  type HardwareFact,
  type VitalsFact,
} from "@/lib/adapters/server";

/** Re-exported for the callers that read staleness without reading the gate. */
export { STALE_MULTIPLE };

export type GateProblem =
  | { kind: "down"; name: string; since: Date }
  | { kind: "stale"; collector: string; lastSuccessAt: Date | null }
  /**
   * Working, but with nothing to spare. One array disk disabled and its
   * contents emulated from parity: everything reads, and the next failure is
   * the one that costs something.
   */
  | { kind: "degraded"; disks: string[]; spare: number };

export type Gate = {
  /**
   * `clear` is the only state that is allowed to look reassuring.
   *
   * **`degraded` exists because green was wrong.** With a disabled array disk
   * the gate said "All clear" and the rail's Systems dot stayed green — the
   * house was not broken, so nothing in v1 had a word for "the house is running
   * on its spare". Amber, not red: with dual parity and one disk emulated
   * everything still reads and there is redundancy left. It becomes `problems`
   * when there is not.
   */
  state: "clear" | "degraded" | "problems";
  /** Drives the "as of" stamp. Null means the collector has never succeeded. */
  asOf: Date | null;
  stale: boolean;
  monitorsUp: number;
  monitorsTotal: number;
  problems: GateProblem[];
};

/**
 * The gate's verdict, given what is wrong.
 *
 * Pure, and separate from `readGate`, because this is the rule rather than the
 * reading — and it is a rule with a threshold worth pinning down:
 *
 * - **A service down is red.** Something is not answering.
 * - **A disabled disk with redundancy left is amber.** Everything reads, the
 *   array is running on its spare, and the replacement can arrive tomorrow.
 * - **A disabled disk with no redundancy left is red**, and sits with the
 *   services that are down. At that point the next failure costs data, which is
 *   not a thing to find out about on a Thursday.
 */
export function gateVerdict(args: {
  down: number;
  disabled: number;
  spare: number;
}): Gate["state"] {
  if (args.down > 0) return "problems";
  if (args.disabled === 0) return "clear";
  return args.spare === 0 ? "problems" : "degraded";
}

/**
 * Wrapped in `cache` because Home reads the gate **four times** in one render:
 * the stats band, the gate card, `readLauncher` for the tile status dots, and
 * the rail's nav badge. `cache` dedupes within a single render pass, so they
 * all see one answer as well as costing one query.
 *
 * **Call it with no argument.** `cache` keys on the arguments, and a `Date` is
 * a fresh object every time — so `readGate(now)` from two callers is two keys
 * and two queries, and the wrapper would quietly do nothing. The parameter
 * stays for tests; every caller in the app passes nothing.
 */
export const readGate = cache(async function readGate(now: Date = new Date()): Promise<Gate> {
  const [status, arrayFact] = await Promise.all([
    prisma.sourceStatus.findUnique({ where: { source: "kuma" } }),
    readFact<ArrayFact>(UNRAID_ARRAY),
  ]);

  /**
   * The array's contribution to the gate.
   *
   * `spare` is how much redundancy survives: a disabled disk consumes one
   * parity device's worth. Two parity devices and one disabled disk leaves one
   * spare and is amber; exhaust it and the array is one failure from data loss,
   * which is red and belongs with the services that are down.
   *
   * Read from the fact rather than from Unraid, like everything else on the
   * page — rule 1. A stale Unraid collector contributes nothing here rather
   * than an old verdict: the Systems page is where staleness is named, and the
   * gate must not claim a disk is fine because nobody looked recently.
   */
  const array = arrayFact?.value ?? null;
  const disabled = array?.disabled ?? [];
  const parityCount = array?.disks.filter((d) => d.role === "Parity").length ?? 0;
  const spare = Math.max(0, parityCount - disabled.length);

  const degraded: GateProblem[] =
    disabled.length > 0 ? [{ kind: "degraded", disks: disabled, spare }] : [];

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
      // The array still counts. Uptime Kuma being blind says nothing about
      // WhiteTower's disks, and dropping the line here would mean a failing
      // collector could hide a failing disk.
      problems: [{ kind: "stale", collector: "Uptime Kuma", lastSuccessAt }, ...degraded],
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

  const problems: GateProblem[] = [
    ...down.map((m): GateProblem => ({ kind: "down", name: m.name, since: m.changedAt })),
    ...degraded,
  ];

  return {
    state: gateVerdict({ down: down.length, disabled: disabled.length, spare }),
    asOf: lastSuccessAt,
    stale: false,
    monitorsUp: monitors.filter((m) => m.status === "up").length,
    monitorsTotal: monitors.length,
    problems,
  };
});

export type MonitorRow = Awaited<ReturnType<typeof prisma.monitor.findMany>>[number];

/**
 * A monitor, plus what Steward has watched happen to it.
 *
 * The stats travel with the row rather than being fetched per card, because a
 * card is a server component rendered in a grid of twenty and twenty queries is
 * how a page gets slow quietly.
 */
export type ServiceRow = MonitorRow & { stats: OutageStats };

export type Systems = {
  kuma: {
    stale: boolean;
    asOf: Date | null;
    monitors: ServiceRow[];
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
  server: {
    /** False when `HOST_PROC_DIR` is unset — not connected, rather than stale. */
    configured: boolean;
    stale: boolean;
    asOf: Date | null;
    /** Null in both cases means the check has never run — not that it found nothing. */
    vitals: VitalsFact | null;
    hardware: HardwareFact | null;
  };
  unraid: {
    /** False when `UNRAID_STATE_DIR` is unset — not connected, rather than stale. */
    configured: boolean;
    stale: boolean;
    asOf: Date | null;
    /** Null in both cases means the check has never run — not that it found nothing. */
    array: ArrayFact | null;
    parity: ParityFact | null;
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
 * What is deliberately **not** here: Home Assistant's persistent notifications
 * and its repairs. Neither is collected — both are WebSocket-only — so the page
 * names them as not connected. Returning zero for a check that was never made
 * is the silent lie rule 2 exists to prevent, and it would be a very
 * comfortable one.
 *
 * Unraid was in that list until 2026-08-31, when it turned out to need no read
 * path at all: Steward runs on the machine, and its state files are right
 * there. See `src/lib/adapters/unraid.ts`.
 */
export async function readSystems(now: Date = new Date()): Promise<Systems> {
  // Both come from facts rather than from the queue's `Item` rows, because
  // dismissal must not change them. The queue asks "does this need you?", and
  // dismissing answers no; this page asks "what is true?", and an update waved
  // past in the queue is still an update that is waiting.
  const [
    collectors,
    unavailableFact,
    updatesFact,
    arrayFact,
    parityFact,
    vitalsFact,
    hardwareFact,
  ] = await Promise.all([
    readCollectors(now),
    readFact<UnavailableFact>(HA_UNAVAILABLE),
    readFact<UpdatesFact>(HA_UPDATES),
    readFact<ArrayFact>(UNRAID_ARRAY),
    readFact<ParityFact>(UNRAID_PARITY),
    readFact<VitalsFact>(SERVER_VITALS),
    readFact<HardwareFact>(SERVER_HARDWARE),
  ]);

  const unavailable = unavailableFact?.value ?? null;
  const updates = updatesFact?.value ?? null;

  const kuma = collectors.all.find((c) => c.source === "kuma") ?? null;
  const ha = collectors.all.find((c) => c.source === "ha") ?? null;
  const unraid = collectors.all.find((c) => c.source === "unraid") ?? null;
  const server = collectors.all.find((c) => c.source === "server") ?? null;

  // Only monitors from the last successful poll, for the same reason the gate
  // uses: one deleted in Kuma should drop out rather than haunt the page.
  const rows =
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

  // One query for every monitor's history rather than one per card. An outage
  // that *started* before the window can still overlap it, so the filter is on
  // when they ended — an open one has not, hence the null.
  const outages =
    rows.length === 0
      ? []
      : await prisma.monitorOutage.findMany({
          where: {
            monitor: { in: rows.map((m) => m.name) },
            OR: [
              { endedAt: null },
              { endedAt: { gte: new Date(now.getTime() - WINDOW_DAYS * 86_400_000) } },
            ],
          },
          select: { monitor: true, startedAt: true, endedAt: true },
        });

  const byMonitor = new Map<string, { startedAt: Date; endedAt: Date | null }[]>();
  for (const outage of outages) {
    const list = byMonitor.get(outage.monitor) ?? [];
    list.push({ startedAt: outage.startedAt, endedAt: outage.endedAt });
    byMonitor.set(outage.monitor, list);
  }

  const monitors: ServiceRow[] = rows.map((m) => ({
    ...m,
    stats: outageStats(byMonitor.get(m.name) ?? [], m.watchedSince, now),
  }));

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
    server: {
      configured: Boolean(process.env.HOST_PROC_DIR),
      stale: server?.stale ?? true,
      asOf: server?.asOf ?? null,
      vitals: vitalsFact?.value ?? null,
      hardware: hardwareFact?.value ?? null,
    },
    unraid: {
      configured: Boolean(process.env.UNRAID_STATE_DIR),
      stale: unraid?.stale ?? true,
      asOf: unraid?.asOf ?? null,
      array: arrayFact?.value ?? null,
      parity: parityFact?.value ?? null,
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
