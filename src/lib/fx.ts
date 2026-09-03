import { readFact } from "@/lib/facts";
import { HORIZON_SUMMARY, type SummaryFact } from "@/lib/adapters/horizon";

/**
 * Money in one currency, read in another.
 *
 * **Steward converts or it says it cannot.** Horizon's own helper
 * (`src/lib/money/fx.ts`, `getLatestFxRate`) returns 1.0 when it has no rate
 * and logs a warning — US dollars quietly counted as Canadian ones. That is a
 * reasonable trade in a portfolio tool where the alternative is a page that
 * will not render, and it is exactly what rule 2 forbids here: a figure shown
 * as current when it is not known. So every function below returns null rather
 * than a number it cannot stand behind, and every caller renders that as
 * missing.
 *
 * Its own module rather than a corner of `finance.ts` so the arithmetic is
 * testable without a database.
 */
export type Fx = {
  /** Multiply US cents by this to get Canadian ones. */
  usdCad: number;
  /** `YYYY-MM-DD`, the day the rate is for. Null when Horizon did not say. */
  date: string | null;
};

/**
 * An amount in CAD cents, or null when it cannot honestly be converted.
 *
 * CAD passes through even with no rate at all — there is nothing to convert,
 * and a missing rate must not blank out the majority of the list.
 *
 * Anything that is neither CAD nor USD returns null. The form offers two
 * currencies, but the column is a free `String`, and a row that somehow held
 * `EUR` must not be multiplied by the US rate and presented as an answer.
 */
export function toCadCents(cents: number, currency: string, fx: Fx | null): number | null {
  if (currency === "CAD") return cents;
  if (currency === "USD") return fx ? Math.round(cents * fx.usdCad) : null;
  return null;
}

/** "1.3652" — the rate itself, for the one line that names where a figure came from. */
export function rateLabel(fx: Fx): string {
  return fx.date ? `at ${fx.usdCad.toFixed(4)} on ${fx.date}` : `at ${fx.usdCad.toFixed(4)}`;
}

/**
 * The rate Horizon last sent, from the database like everything else.
 *
 * It arrives on the portfolio summary rather than on a fact of its own, so
 * there is no second collector and no second `SourceKey` — see
 * `docs/ARCHITECTURE.md`. Staleness is therefore the Horizon collector's, which
 * the Finance panel already reports.
 */
export async function readFx(): Promise<Fx | null> {
  const fact = await readFact<SummaryFact>(HORIZON_SUMMARY);
  // `?? null` rather than a plain read: a fact written before these two fields
  // existed has neither, and `undefined` would flow into `toCadCents` as a
  // truthy-looking object with a NaN rate. The collector overwrites it within
  // fifteen minutes, but the page renders before that.
  const rate = fact?.value.usdCadRate ?? null;
  if (rate === null) return null;

  return { usdCad: rate, date: fact?.value.fxDate ?? null };
}
