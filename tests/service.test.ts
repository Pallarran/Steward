import { describe, expect, it } from "vitest";
import {
  CERT_WARN_DAYS,
  ordinal,
  outageStats,
  serviceCaption,
  uptimeFraction,
  windowLabel,
  type Outage,
} from "@/lib/service";

/**
 * What a service card claims about a service.
 *
 * Every case here is a way to be confidently wrong. An uptime percentage over a
 * window Steward did not watch, a service shown at 100% while it is down, or a
 * certificate reported as expiring today because the monitor has none — all of
 * them read as facts and none of them is one.
 */
const now = new Date("2026-09-03T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

const ago = (ms: number) => new Date(now.getTime() - ms);
const outage = (fromMs: number, toMs: number | null): Outage => ({
  startedAt: ago(fromMs),
  endedAt: toMs === null ? null : ago(toMs),
});

describe("outageStats", () => {
  it("measures the window from when Steward started watching", () => {
    // Six hours of history is six hours of history. Reporting thirty days would
    // be inventing the other twenty-nine.
    const stats = outageStats([], ago(6 * HOUR), now);
    expect(stats.windowMs).toBe(6 * HOUR);
    expect(stats.count).toBe(0);
  });

  it("caps the window at thirty days however long it has been watching", () => {
    expect(outageStats([], ago(400 * DAY), now).windowMs).toBe(30 * DAY);
  });

  it("counts a closed outage inside the window", () => {
    const stats = outageStats([outage(5 * DAY, 5 * DAY - HOUR)], ago(30 * DAY), now);
    expect(stats.count).toBe(1);
    expect(stats.downtimeMs).toBe(HOUR);
  });

  it("counts an open outage up to now", () => {
    // It has not ended. Leaving it out until it does would show a service at
    // 100% while it is down, which is the one moment the figure matters.
    const stats = outageStats([outage(2 * HOUR, null)], ago(30 * DAY), now);
    expect(stats.count).toBe(1);
    expect(stats.downtimeMs).toBe(2 * HOUR);
  });

  it("clips an outage that began before the window", () => {
    // A three-day outage that started before the window contributes only its
    // overlap. Counting the whole of it would make a service look far worse
    // inside the window than it actually was.
    const stats = outageStats([outage(31 * DAY, 29 * DAY)], ago(90 * DAY), now);
    expect(stats.count).toBe(1);
    expect(stats.downtimeMs).toBe(DAY);
  });

  it("ignores an outage that ended before the window opened", () => {
    expect(outageStats([outage(40 * DAY, 39 * DAY)], ago(90 * DAY), now).count).toBe(0);
  });

  it("adds several", () => {
    const stats = outageStats(
      [outage(10 * DAY, 10 * DAY - HOUR), outage(3 * DAY, 3 * DAY - 2 * HOUR)],
      ago(30 * DAY),
      now,
    );
    expect(stats.count).toBe(2);
    expect(stats.downtimeMs).toBe(3 * HOUR);
  });
});

describe("uptimeFraction", () => {
  it("is null when there is no window to divide by", () => {
    // The first poll after a deploy. A service watched for no time has no
    // uptime, and 100% would be a claim rather than a measurement.
    expect(uptimeFraction({ count: 0, downtimeMs: 0, windowMs: 0 })).toBeNull();
  });

  it("is one with no downtime", () => {
    expect(uptimeFraction({ count: 0, downtimeMs: 0, windowMs: 30 * DAY })).toBe(1);
  });

  it("subtracts the downtime", () => {
    expect(uptimeFraction({ count: 1, downtimeMs: DAY, windowMs: 10 * DAY })).toBeCloseTo(0.9);
  });
});

describe("serviceCaption", () => {
  const base = {
    responseMs: 42,
    certDays: null,
    changedFor: "41 minutes",
    stats: { count: 0, downtimeMs: 0, windowMs: 14 * DAY },
  };

  it("says how long a service has been down", () => {
    expect(serviceCaption({ ...base, status: "down", stats: { ...base.stats, count: 1 } })).toBe(
      "down 41 minutes",
    );
  });

  it("says which outage this is when there have been others", () => {
    // Down for the third time this month is a different problem from down for
    // the first, and nothing else on the page carries the count.
    expect(
      serviceCaption({ ...base, status: "down", stats: { count: 3, downtimeMs: 0, windowMs: 14 * DAY } }),
    ).toBe("down 41 minutes · 3rd in 14 days");
  });

  it("puts a certificate ahead of the record", () => {
    // The only thing on the card that is actionable while the service is up.
    expect(serviceCaption({ ...base, status: "up", certDays: 9 })).toBe(
      "42 ms · cert expires in 9 days",
    );
  });

  it("says an expired certificate has expired rather than counting to zero", () => {
    expect(serviceCaption({ ...base, status: "up", certDays: 0 })).toBe(
      "42 ms · certificate has expired",
    );
  });

  it("ignores a certificate with plenty of life in it", () => {
    // Under thirty days is the normal state of a renewing certificate, so
    // mentioning it on every card would be noise.
    expect(serviceCaption({ ...base, status: "up", certDays: CERT_WARN_DAYS + 1 })).toBe(
      "42 ms · no outages in 14 days",
    );
  });

  it("names the window it actually watched", () => {
    expect(
      serviceCaption({ ...base, status: "up", stats: { count: 0, downtimeMs: 0, windowMs: 6 * HOUR } }),
    ).toBe("42 ms · no outages in 6 hours");
  });

  it("gives just the response time when it has watched no time at all", () => {
    // The first minute after a deploy. Better a short caption than a fabricated
    // percentage.
    expect(
      serviceCaption({ ...base, status: "up", stats: { count: 0, downtimeMs: 0, windowMs: 0 } }),
    ).toBe("42 ms");
  });

  it("reports a percentage once there is something to report", () => {
    expect(
      serviceCaption({
        ...base,
        status: "up",
        stats: { count: 2, downtimeMs: 6 * HOUR, windowMs: 30 * DAY },
      }),
    ).toBe("42 ms · 99.1%, 2 outages");
  });

  it("never rounds up to a perfect month", () => {
    // A service down for one minute did not have a perfect month, and "100.0%"
    // would say it did. Losing precision downwards is the honest direction.
    const caption = serviceCaption({
      ...base,
      status: "up",
      stats: { count: 1, downtimeMs: 60_000, windowMs: 30 * DAY },
    });
    expect(caption).toBe("42 ms · 99.9%, 1 outage");
  });

  it("falls back to 'up' when Kuma publishes no response time", () => {
    expect(
      serviceCaption({ ...base, status: "up", responseMs: null, stats: { count: 0, downtimeMs: 0, windowMs: 0 } }),
    ).toBe("up");
  });

  it("says the bare word for pending and maintenance", () => {
    expect(serviceCaption({ ...base, status: "pending" })).toBe("pending");
    expect(serviceCaption({ ...base, status: "maintenance" })).toBe("maintenance");
  });
});

describe("windowLabel", () => {
  it("does not claim an hour it has not had", () => {
    expect(windowLabel(0)).toBe("less than an hour");
    expect(windowLabel(59 * 60_000)).toBe("less than an hour");
  });

  it("counts hours up to two days, then days", () => {
    expect(windowLabel(HOUR)).toBe("1 hour");
    expect(windowLabel(30 * HOUR)).toBe("30 hours");
    expect(windowLabel(3 * DAY)).toBe("3 days");
  });
});

describe("ordinal", () => {
  it("handles the ones the last digit gets wrong", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
  });

  it("handles the rest", () => {
    expect([1, 2, 3, 4, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "21st", "22nd"]);
  });
});
