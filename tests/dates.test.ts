import { describe, expect, it } from "vitest";
import { clock, duration } from "@/lib/format";
import { isDueOrOverdue, todayInHouse } from "@/lib/adapters/todoist";

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

describe("isDueOrOverdue", () => {
  const today = "2026-08-30";

  it("counts today and anything before it", () => {
    expect(isDueOrOverdue({ date: today }, today)).toBe(true);
    expect(isDueOrOverdue({ date: "2026-08-01" }, today)).toBe(true);
  });

  it("excludes tomorrow", () => {
    expect(isDueOrOverdue({ date: "2026-08-31" }, today)).toBe(false);
  });

  it("compares a datetime as the calendar day it names", () => {
    // A late-evening due time is due today, not tomorrow in UTC.
    expect(isDueOrOverdue({ date: "2026-08-30T23:30:00" }, today)).toBe(true);
    expect(isDueOrOverdue({ date: "2026-08-31T00:30:00" }, today)).toBe(false);
  });

  it("treats a task with no due date as not due", () => {
    expect(isDueOrOverdue(null, today)).toBe(false);
    expect(isDueOrOverdue(undefined, today)).toBe(false);
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
