import type { SourceKey } from "@/generated/prisma/enums";

/**
 * The adapter contract, from docs/ARCHITECTURE.md.
 *
 * Every source is one module exposing exactly this. Adapters write to the
 * database; the UI reads only the database. No adapter is ever called from a
 * page, a server component, or a route handler that renders — a dead source
 * cannot break the page, it can only turn a panel amber.
 */
export type Adapter = {
  key: SourceKey;
  intervalSeconds: number;
  /**
   * Does the source's own work and writes its rows. Throwing is how an adapter
   * reports failure; the runner records it and the panel goes amber.
   *
   * Returns a short human summary for the log — not for the UI, which reads
   * SourceStatus instead.
   */
  run(now: Date): Promise<string>;
};
