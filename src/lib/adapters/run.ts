import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import type { Adapter } from "./types";

const MAX_BACKOFF_STEPS = 5;

/**
 * Runs one adapter and records the outcome.
 *
 * docs/ARCHITECTURE.md, rules 2 and 3: errors are isolated per source, and
 * every run records its outcome with a timestamp. That record is not logging —
 * it is the data that drives the amber state in the UI. This function is the
 * only place SourceStatus is written, so no adapter can forget to.
 */
export async function runAdapter(adapter: Adapter, now: Date = new Date()): Promise<void> {
  const { key, intervalSeconds } = adapter;

  const existing = await prisma.sourceStatus.findUnique({ where: { source: key } });

  // Exponential backoff after failures, per rule 6. Skipping a run is not the
  // same as succeeding: lastSuccessAt does not move, so the panel still goes
  // amber on schedule and Vincent still finds out.
  if (existing && existing.consecutiveFailures > 0 && existing.lastErrorAt) {
    const steps = Math.min(existing.consecutiveFailures, MAX_BACKOFF_STEPS);
    const waitMs = intervalSeconds * 1000 * 2 ** steps;
    if (now.getTime() - existing.lastErrorAt.getTime() < waitMs) {
      log.debug({ source: key, failures: existing.consecutiveFailures }, "Backing off");
      return;
    }
  }

  try {
    const summary = await adapter.run(now);

    await prisma.sourceStatus.upsert({
      where: { source: key },
      update: {
        intervalSeconds,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
      },
      create: { source: key, intervalSeconds, lastSuccessAt: now },
    });

    log.info({ source: key, summary }, "Collector ran");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await prisma.sourceStatus
      .upsert({
        where: { source: key },
        update: {
          intervalSeconds,
          lastErrorAt: now,
          lastError: message,
          consecutiveFailures: { increment: 1 },
        },
        create: {
          source: key,
          intervalSeconds,
          lastErrorAt: now,
          lastError: message,
          consecutiveFailures: 1,
        },
      })
      // If even recording the failure fails, the database is the problem and
      // there is nowhere left to write it. Log and let the panel go stale.
      .catch((e) => log.error({ source: key, err: e }, "Could not record failure"));

    log.error({ source: key, err: message }, "Collector failed");
  }
}
