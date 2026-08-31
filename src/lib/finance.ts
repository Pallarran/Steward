import { readFact } from "@/lib/facts";
import { readCollectors } from "@/lib/collectors";
import { HORIZON_SUMMARY, type SummaryFact } from "@/lib/adapters/horizon";
import { todayInHouse } from "@/lib/adapters/todoist";

export type Finance = {
  summary: SummaryFact | null;
  /** When Horizon answered, from the fact itself rather than the collector. */
  asOf: Date | null;
  /** The collector is behind: these numbers may not be Horizon's current ones. */
  stale: boolean;
  configured: boolean;
  /**
   * The prices are not today's. True on a weekend, a holiday, or any morning
   * before the first fetch — and it is the difference between "+0.4% today" and
   * "+0.4% on Friday", which is the whole reason the market date is carried.
   */
  priceDateIsToday: boolean;
};

export async function readFinance(now: Date = new Date()): Promise<Finance> {
  const [fact, collectors] = await Promise.all([
    readFact<SummaryFact>(HORIZON_SUMMARY),
    readCollectors(now),
  ]);

  const horizon = collectors.all.find((c) => c.source === "horizon") ?? null;

  return {
    summary: fact?.value ?? null,
    asOf: fact?.at ?? null,
    stale: horizon?.stale ?? true,
    // No SourceStatus row at all means the collector has never run, which is
    // not the same as failing and should not be reported as such.
    configured: horizon !== null,
    priceDateIsToday: fact?.value.priceDate === todayInHouse(now),
  };
}

/** Cents to dollars, in the house's locale. Never abbreviated: this is money. */
export function money(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** A decimal to a signed percentage: 0.004 becomes "+0.40%". */
/**
 * The same, to the cent.
 *
 * `money` rounds to whole dollars, which is right for a portfolio and wrong for
 * a subscription — $18.99 rendered as **$19** on the Documents page for as long
 * as it lived there. Two named functions rather than a flag, so the call site
 * says which it means.
 */
export function moneyExact(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function percent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}
