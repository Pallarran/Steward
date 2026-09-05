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
  /**
   * The market value of the **investable portfolio** — positions plus cash,
   * ownership-weighted.
   *
   * Horizon calls this `netWorthCents` and its own comment warns that the name
   * is wrong: it excludes the house and every liability, so it is not net worth
   * and it is not the amount invested either. The wire name is kept so the
   * field matches what the endpoint sends, and this comment exists because the
   * first label written from it said "Invested", which is the cost basis and a
   * different number entirely.
   */
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
  /**
   * USD→CAD. Null when Horizon has no rate, and **null is not one**.
   *
   * Nothing else on this fact is about the portfolio's currency: every figure
   * above is already CAD. This rides along because Steward's subscriptions can
   * be billed in US dollars, and Horizon has been fetching this rate five times
   * a weekday since long before Steward asked for it.
   */
  usdCadRate: number | null;
  /** `YYYY-MM-DD`, the day the rate is for — not the day it was read. */
  fxDate: string | null;

  /**
   * What Vincent is actually worth: the portfolio plus the house and the
   * vehicles, less what is owed.
   *
   * **This is the figure `netWorthCents` is mistaken for.** That one is
   * positions plus cash and counts neither side of the balance sheet — Horizon
   * names it badly and its own comment says so — so Steward showed the
   * investable portfolio under a heading called Portfolio and never had the
   * number a person means by "net worth".
   *
   * Null on a Steward talking to a Horizon that has not been redeployed. Every
   * field below is the same, and each renders as absent rather than as zero.
   */
  trueNetWorthCents: number | null;
  /** The house and the vehicles, ownership-weighted. */
  manualAssetsCents: number | null;
  /** Mortgages and loans, ownership-weighted. Positive; it is subtracted. */
  liabilitiesCents: number | null;

  /** Cost basis of the positions, and the cash sitting inside the portfolio. */
  totalCostCents: number | null;
  cashCadCents: number | null;
  cashUsdCents: number | null;

  /**
   * Registered-account room for the calendar year.
   *
   * The one figure on the whole finance page with a deadline attached: room not
   * used by 31 December is room carried differently or lost, depending on the
   * account.
   */
  room: {
    year: number;
    celiRemainingCents: number;
    reerRemainingCents: number;
    crcdRemainingCents: number;
    celiCumulativeRemainingCents: number;
    reerCumulativeRemainingCents: number;
  } | null;

  /** What the portfolio pays — forward-looking, and so far this year. */
  dividends: {
    annualizedCents: number;
    monthlyAvgCents: number;
    ytdCents: number;
    expectedYtdCents: number;
    priorYearCents: number;
    ytdGrowthPercent: number;
  } | null;
};

type Payload = SummaryFact & { asOf?: string };

/**
 * The band Horizon's own fetcher rejects outside of. USD/CAD has lived between
 * 0.9 and 1.6 for fifty years, so anything beyond this is a parse error or a
 * bad quote, and a subscription converted by it would be silently wrong rather
 * than visibly missing.
 */
function sane(rate: unknown): number | null {
  return typeof rate === "number" && rate >= 0.1 && rate <= 10 ? rate : null;
}

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

    // A summary with no value is a summary that failed quietly. Writing it
    // through would show a confident $0 on the panel, which is worse than amber.
    if (typeof payload.netWorthCents !== "number") {
      throw new Error("Horizon returned no portfolio value");
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
        // Deliberately not a throw, unlike the portfolio value above. The
        // figures on the Finance panel do not depend on this, and turning the
        // whole collector amber because a nightly FX job has not run yet would
        // report a problem Vincent does not have.
        usdCadRate: sane(payload.usdCadRate),
        fxDate: payload.fxDate ?? null,

        // `?? null` on every one of these, and it is not defensive noise: a
        // Steward pointed at a Horizon that has not been redeployed gets a
        // payload without them, and each has to read as *absent* rather than
        // as zero. A confident $0 net worth is exactly the failure rule 2 is
        // for, and it is the state this deploy passes through.
        trueNetWorthCents: payload.trueNetWorthCents ?? null,
        manualAssetsCents: payload.manualAssetsCents ?? null,
        liabilitiesCents: payload.liabilitiesCents ?? null,
        totalCostCents: payload.totalCostCents ?? null,
        cashCadCents: payload.cashCadCents ?? null,
        cashUsdCents: payload.cashUsdCents ?? null,
        room: payload.room ?? null,
        dividends: payload.dividends ?? null,
      } satisfies SummaryFact,
      now,
    );

    const change = payload.dayChangePercent >= 0 ? "+" : "";
    return `portfolio read, ${change}${(payload.dayChangePercent * 100).toFixed(2)}% on ${payload.priceDate ?? "an unknown session"}`;
  },
};
