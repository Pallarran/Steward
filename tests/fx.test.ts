import { describe, expect, it } from "vitest";
import { rateLabel, toCadCents, type Fx } from "@/lib/fx";

/**
 * The conversion, and the refusals.
 *
 * **The refusals are the point.** Horizon's own `getLatestFxRate` returns 1.0
 * with a warning when it has no rate, so a US dollar silently becomes a
 * Canadian one. Steward cannot do that: a subscription total is the number
 * Vincent budgets against, and one quietly understated by a third is worse than
 * one that says a row is missing from it.
 */
const FX: Fx = { usdCad: 1.3652, date: "2026-09-01" };

describe("toCadCents", () => {
  it("leaves Canadian money alone", () => {
    expect(toCadCents(1899, "CAD", FX)).toBe(1899);
  });

  it("leaves Canadian money alone even with no rate at all", () => {
    // The common case on a fresh install, and the one that must not blank out
    // the whole list: there is nothing to convert.
    expect(toCadCents(1899, "CAD", null)).toBe(1899);
  });

  it("converts US dollars and rounds to the cent", () => {
    // 999 × 1.3652 = 1363.8348, and money is integer cents everywhere in this
    // app. Rounded once, here, rather than accumulated as a float.
    expect(toCadCents(999, "USD", FX)).toBe(1364);
  });

  it("refuses rather than assuming parity when there is no rate", () => {
    expect(toCadCents(999, "USD", null)).toBeNull();
  });

  it("refuses a currency it holds no rate for", () => {
    // The form offers two, but the column is a free String. A euro multiplied
    // by the US rate is a confident wrong answer.
    expect(toCadCents(999, "EUR", FX)).toBeNull();
  });
});

describe("rateLabel", () => {
  it("names the rate and the day it is for", () => {
    expect(rateLabel(FX)).toBe("at 1.3652 on 2026-09-01");
  });

  it("drops the day when Horizon did not send one", () => {
    // Rather than inventing today's date, which would date a rate of unknown
    // age as current.
    expect(rateLabel({ usdCad: 1.3652, date: null })).toBe("at 1.3652");
  });
});
