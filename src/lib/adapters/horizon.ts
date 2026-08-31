import { writeFact } from "@/lib/facts";
import { request } from "./http";
import type { Adapter } from "./types";

const TIMEOUT_MS = 15_000;

/**
 * The portfolio summary, from Horizon's `GET /api/summary`.
 *
 * Aggregates only. Horizon holds every holding, transaction and account name,
 * and none of that crosses: the endpoint was built narrow on purpose, so
 * Steward cannot leak what it never receives.
 */
export const HORIZON_SUMMARY = "horizon:summary";

export type SummaryFact = {
  currency: string;
  netWorthCents: number;
  dayChangeCents: number;
  /** A decimal, so 0.004 is +0.4%. */
  dayChangePercent: number;
  unrealizedGainCents: number;
  unrealizedGainPercent: number;
  /** When Horizon last wrote a price row: is the fetch healthy? */
  pricesAsOf: string | null;
  /** `YYYY-MM-DD`, the market date these figures describe. */
  priceDate: string | null;
};

type Payload = SummaryFact & { asOf?: string };

/**
 * 15 minutes, per `docs/ARCHITECTURE.md`.
 *
 * Slower than the gate because the underlying data moves slower still: Horizon
 * fetches prices five times a day on weekdays. Polling harder would only cost
 * requests to learn the same number again.
 */
export const horizonAdapter: Adapter = {
  key: "horizon",
  intervalSeconds: 900,

  async run(now) {
    const base = process.env.HORIZON_BASE_URL;
    const key = process.env.HORIZON_API_KEY;
    if (!base || !key) throw new Error("HORIZON_BASE_URL and HORIZON_API_KEY are not set");

    const response = await request(new URL("/api/summary", base), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (response.status === 401) {
      // Worth naming precisely: this is the one failure a redeploy will not
      // fix, and "Horizon answered 401" reads as a Horizon fault rather than a
      // key that does not match on the two sides.
      throw new Error("Horizon rejected the key — HORIZON_API_KEY and STEWARD_API_KEY differ");
    }
    if (!response.ok) {
      throw new Error(`Horizon answered ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as Payload;

    // A summary with no net worth is a summary that failed quietly. Writing it
    // through would show a confident $0 on the panel, which is worse than amber.
    if (typeof payload.netWorthCents !== "number") {
      throw new Error("Horizon returned no net worth");
    }

    await writeFact(
      HORIZON_SUMMARY,
      "horizon",
      {
        currency: payload.currency ?? "CAD",
        netWorthCents: payload.netWorthCents,
        dayChangeCents: payload.dayChangeCents ?? 0,
        dayChangePercent: payload.dayChangePercent ?? 0,
        unrealizedGainCents: payload.unrealizedGainCents ?? 0,
        unrealizedGainPercent: payload.unrealizedGainPercent ?? 0,
        pricesAsOf: payload.pricesAsOf ?? null,
        priceDate: payload.priceDate ?? null,
      } satisfies SummaryFact,
      now,
    );

    const change = payload.dayChangePercent >= 0 ? "+" : "";
    return `net worth read, ${change}${(payload.dayChangePercent * 100).toFixed(2)}% on ${payload.priceDate ?? "an unknown date"}`;
  },
};
