import { describe, expect, it } from "vitest";
import { monthlyCadTotal, monthlyEquivalentCents, nextRenewal } from "@/lib/subscriptions";

/** A calendar day at noon UTC, the way the page stores and compares them. */
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("nextRenewal", () => {
  const now = day("2026-08-31");

  it("leaves a future date alone", () => {
    expect(ymd(nextRenewal(day("2026-09-15"), "monthly", now))).toBe("2026-09-15");
  });

  it("counts today as still due, not passed", () => {
    // A renewal today is today's problem, and the queue row should say so
    // rather than jumping to next month.
    expect(ymd(nextRenewal(day("2026-08-31"), "monthly", now))).toBe("2026-08-31");
  });

  it("rolls a past date forward by one step", () => {
    expect(ymd(nextRenewal(day("2026-08-15"), "monthly", now))).toBe("2026-09-15");
  });

  it("rolls a long-past date forward as far as it needs", () => {
    // The case the whole design exists for: the date typed off an old
    // statement, and Steward having been off for a while.
    expect(ymd(nextRenewal(day("2024-03-04"), "monthly", now))).toBe("2026-09-04");
    expect(ymd(nextRenewal(day("2019-11-20"), "yearly", now))).toBe("2026-11-20");
    expect(ymd(nextRenewal(day("2026-01-06"), "weekly", now))).toBe("2026-09-01");
    expect(ymd(nextRenewal(day("2025-02-10"), "quarterly", now))).toBe("2026-11-10");
  });

  it("does not drift across a daylight-saving change", () => {
    // A yearly renewal anchored in EST, read from EDT. Working on the UTC
    // calendar at noon is what keeps this on the 4th rather than the 3rd.
    expect(ymd(nextRenewal(day("2026-02-04"), "yearly", now))).toBe("2027-02-04");
  });

  it("clamps a month-end anchor to the length of the month", () => {
    // 31 October plus a month is not 31 November. Naively stepping the date
    // forward overflows into 1 December, and from then on the subscription
    // renews on the 1st for ever.
    expect(ymd(nextRenewal(day("2026-10-31"), "monthly", day("2026-11-15")))).toBe("2026-11-30");
    expect(ymd(nextRenewal(day("2026-01-31"), "monthly", day("2026-02-10")))).toBe("2026-02-28");
  });

  it("recovers the day of the month after a short one", () => {
    // The reason each candidate is measured from the anchor rather than from
    // the previous step: a card billed on the 31st goes back to the 31st.
    expect(ymd(nextRenewal(day("2026-01-31"), "monthly", day("2026-03-05")))).toBe("2026-03-31");
    expect(ymd(nextRenewal(day("2026-01-31"), "monthly", day("2026-04-01")))).toBe("2026-04-30");
  });

  it("gets 29 February right in a leap year and out of one", () => {
    expect(ymd(nextRenewal(day("2024-02-29"), "yearly", day("2027-01-01")))).toBe("2027-02-28");
    expect(ymd(nextRenewal(day("2024-02-29"), "yearly", day("2028-01-01")))).toBe("2028-02-29");
  });

  it("survives a nonsense anchor from the far past without hanging", () => {
    // The step guard: weekly since 1970 exceeds it, and the result is wrong
    // rather than a loop that never ends. Wrong and fast beats hung.
    const result = nextRenewal(day("1970-01-01"), "weekly", now);
    expect(result).toBeInstanceOf(Date);
  });
});

describe("monthlyEquivalentCents", () => {
  it("leaves a monthly charge alone", () => {
    expect(monthlyEquivalentCents({ amountCents: 1899, cadence: "monthly" })).toBe(1899);
  });

  it("spreads a yearly charge over twelve months", () => {
    expect(monthlyEquivalentCents({ amountCents: 12000, cadence: "yearly" })).toBe(1000);
  });

  it("spreads a quarterly charge over three", () => {
    expect(monthlyEquivalentCents({ amountCents: 4500, cadence: "quarterly" })).toBe(1500);
  });

  it("uses 52 weeks a year, not four weeks a month", () => {
    // $10 a week is $43.33 a month, not $40. Four would understate the total
    // by 8%, and the error compounds across a list.
    expect(monthlyEquivalentCents({ amountCents: 1000, cadence: "weekly" })).toBe(4333);
  });

  it("adds a mixed list correctly", () => {
    const subs = [
      { amountCents: 1899, cadence: "monthly" as const },
      { amountCents: 12000, cadence: "yearly" as const },
      { amountCents: 1000, cadence: "weekly" as const },
    ];

    // The failure this guards against is adding a yearly and a monthly charge
    // as though they were the same thing.
    expect(subs.reduce((t, s) => t + monthlyEquivalentCents(s), 0)).toBe(1899 + 1000 + 4333);
  });
});

/**
 * The total, across two currencies.
 *
 * A subscription can be billed in US dollars, and the monthly figure is the one
 * Vincent budgets against. Adding the two currencies' cents together gives a
 * number that looks right and is a third too low.
 */
describe("monthlyCadTotal", () => {
  const row = (monthlyCadCents: number | null, active = true) => ({ monthlyCadCents, active });

  it("adds the converted figures, not the raw ones", () => {
    expect(monthlyCadTotal([row(1899), row(1364)])).toEqual({
      monthlyCents: 3263,
      unconverted: 0,
    });
  });

  it("ignores a cancelled subscription", () => {
    // It takes no money, so it is not part of what the month costs.
    expect(monthlyCadTotal([row(1899), row(9999, false)]).monthlyCents).toBe(1899);
  });

  it("leaves out what it cannot convert, and counts it", () => {
    // Excluded rather than added at face value: the alternative is a total
    // that is wrong in the direction that flatters, silently. The count is
    // what lets the page admit the figure is incomplete.
    expect(monthlyCadTotal([row(1899), row(null)])).toEqual({
      monthlyCents: 1899,
      unconverted: 1,
    });
  });

  it("does not count a cancelled row it could not convert", () => {
    // It was never going into the total, so it is not missing from it, and
    // saying otherwise would put a permanent warning on the page.
    expect(monthlyCadTotal([row(1899), row(null, false)]).unconverted).toBe(0);
  });
});

/**
 * The Finance card's month boundaries.
 *
 * The cards flow in one continuous grid rather than under per-month headings,
 * so the only thing marking a month is the first card of each run naming it.
 * That flag is derived by comparing each card's month against the previous
 * one's — this is that comparison, lifted out so the rule can be tested without
 * a render.
 */
function opensMonth(dates: string[]): boolean[] {
  const key = (d: string) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: "America/Toronto",
    }).format(new Date(`${d}T12:00:00Z`));

  return dates.map((d, i) => i === 0 || key(d) !== key(dates[i - 1]));
}

describe("month boundaries in the renewal flow", () => {
  it("names the month on the first card and on every change", () => {
    expect(
      opensMonth(["2026-10-06", "2026-10-12", "2026-10-28", "2026-11-03", "2026-11-15"]),
    ).toEqual([true, false, false, true, false]);
  });

  it("marks a month that holds a single renewal", () => {
    // The case the earlier per-month-grid layout handled worst: one
    // subscription in a month took a whole row and left the width empty.
    // In a flow it is one card that happens to name its month.
    expect(opensMonth(["2026-10-06", "2026-11-03", "2026-12-01"])).toEqual([true, true, true]);
  });

  it("marks the same month in a different year as a new month", () => {
    // An annual renewal a year out must not be read as continuing this
    // October just because it is also an October.
    expect(opensMonth(["2026-10-06", "2027-10-06"])).toEqual([true, true]);
  });

  it("skips no months, because months are never rendered — only crossed", () => {
    // A yearly renewal between two monthlies creates no gap: the flow has no
    // month rows to leave empty, which is the whole reason it is a flow.
    expect(opensMonth(["2026-10-06", "2027-03-15", "2027-03-20"])).toEqual([true, true, false]);
  });
});
