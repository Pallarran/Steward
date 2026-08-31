import { describe, expect, it } from "vitest";
import { clock, duration } from "@/lib/format";
import { HORIZON_DAYS, horizonDay, isWithinHorizon, todayInHouse } from "@/lib/adapters/todoist";

/**
 * Everything here is in America/Toronto, deliberately and everywhere. The
 * container runs with TZ set, but a test that relied on that would pass on
 * WhiteTower and fail on a laptop — and the bug it would be hiding is the worst
 * kind: a task that shows as due on the wrong day.
 */
describe("todayInHouse", () => {
  it("uses the house timezone, not UTC", () => {
    // 01:30 UTC on the 31st is still 21:30 on the 30th in Toronto.
    expect(todayInHouse(new Date("2026-08-31T01:30:00Z"))).toBe("2026-08-30");
  });

  it("rolls over at local midnight", () => {
    // 03:59 UTC = 23:59 EDT, still the 30th.
    expect(todayInHouse(new Date("2026-08-31T03:59:00Z"))).toBe("2026-08-30");
    // 04:00 UTC = 00:00 EDT, now the 31st.
    expect(todayInHouse(new Date("2026-08-31T04:00:00Z"))).toBe("2026-08-31");
  });

  it("is right on both sides of the daylight-saving change", () => {
    // EST is UTC-5, so midnight arrives an hour later in UTC terms.
    expect(todayInHouse(new Date("2026-01-15T04:59:00Z"))).toBe("2026-01-14");
    expect(todayInHouse(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });
});

describe("isWithinHorizon", () => {
  const today = "2026-08-30";
  const horizon = "2026-09-06";

  it("counts today and anything before it", () => {
    expect(isWithinHorizon({ date: today }, today, horizon)).toBe(true);
    expect(isWithinHorizon({ date: "2026-08-01" }, today, horizon)).toBe(true);
  });

  it("now counts the week ahead, which it did not before 2026-08-31", () => {
    // The filter used to stop at today, which is why the Task table could be
    // treated as "everything needing attention now". It cannot any more.
    expect(isWithinHorizon({ date: "2026-08-31" }, today, horizon)).toBe(true);
    expect(isWithinHorizon({ date: horizon }, today, horizon)).toBe(true);
  });

  it("stops at the horizon", () => {
    expect(isWithinHorizon({ date: "2026-09-07" }, today, horizon)).toBe(false);
    expect(isWithinHorizon({ date: "2027-01-01" }, today, horizon)).toBe(false);
  });

  it("compares a datetime as the calendar day it names", () => {
    // A late-evening due time is due on its own day, not the next one in UTC.
    expect(isWithinHorizon({ date: "2026-09-06T23:30:00" }, today, horizon)).toBe(true);
    expect(isWithinHorizon({ date: "2026-09-07T00:30:00" }, today, horizon)).toBe(false);
  });

  it("treats a task with no due date as out of range", () => {
    expect(isWithinHorizon(null, today, horizon)).toBe(false);
    expect(isWithinHorizon(undefined, today, horizon)).toBe(false);
  });
});

describe("horizonDay", () => {
  it("reaches tomorrow by default, and no further", () => {
    // The window is a product decision, not an implementation detail: a week
    // of tasks buried the two things actually due today. Every other case here
    // passes the window explicitly, which is exactly why none of them would
    // have caught that.
    expect(HORIZON_DAYS).toBe(1);
    expect(horizonDay(new Date("2026-08-30T12:00:00Z"))).toBe("2026-08-31");
  });

  it("counts calendar days in the house, not milliseconds", () => {
    // 2026-11-01 is the DST fallback in America/Toronto. Adding 7 * 86_400_000
    // to an instant lands an hour early and can name the day before.
    expect(horizonDay(new Date("2026-10-29T12:00:00Z"), 7)).toBe("2026-11-05");
  });

  it("crosses a month end", () => {
    expect(horizonDay(new Date("2026-08-30T12:00:00Z"), 7)).toBe("2026-09-06");
  });
});

describe("duration", () => {
  const now = new Date("2026-08-30T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("picks the largest unit that still reads honestly", () => {
    expect(duration(ago(30_000), now)).toBe("less than a minute");
    expect(duration(ago(41 * 60_000), now)).toBe("41 minutes");
    expect(duration(ago(3 * 3_600_000), now)).toBe("3 hours");
    expect(duration(ago(2 * 86_400_000), now)).toBe("2 days");
  });

  it("gets the singular right", () => {
    expect(duration(ago(60_000), now)).toBe("1 minute");
    expect(duration(ago(3_600_000), now)).toBe("1 hour");
    expect(duration(ago(86_400_000), now)).toBe("1 day");
  });

  it("never reports negative time for a clock that is slightly ahead", () => {
    expect(duration(new Date(now.getTime() + 5_000), now)).toBe("less than a minute");
  });
});

describe("clock", () => {
  it("shows the house's wall time, 24-hour and zero-padded", () => {
    expect(clock(new Date("2026-08-30T12:57:00Z"))).toBe("08:57");
    expect(clock(new Date("2026-08-30T13:00:00Z"))).toBe("09:00");
  });
});
