import { describe, expect, it } from "vitest";
import { parseLoadavg, parseMeminfo, parseUptime, readThermal } from "@/lib/adapters/server";

describe("parseUptime", () => {
  it("takes the first figure and ignores the idle count", () => {
    // 14 days, and the second number is idle-seconds summed across every core,
    // which is larger than the first and means nothing here.
    expect(parseUptime("1234567.89 9876543.21\n")).toBeCloseTo(1234567.89);
  });

  it("throws rather than reporting a machine that just booted", () => {
    expect(() => parseUptime("")).toThrow();
    expect(() => parseUptime("unknown\n")).toThrow();
  });
});

describe("parseLoadavg", () => {
  it("reads the three averages and drops the rest of the line", () => {
    expect(parseLoadavg("0.82 1.10 0.94 2/1387 30021\n")).toEqual([0.82, 1.1, 0.94]);
  });

  it("throws on a short or malformed line", () => {
    expect(() => parseLoadavg("0.82 1.10\n")).toThrow();
    expect(() => parseLoadavg("")).toThrow();
  });
});

describe("parseMeminfo", () => {
  // Trimmed from a real /proc/meminfo. MemFree is tiny and MemAvailable is
  // large, which is the normal state of a fileserver and the whole reason the
  // two are not interchangeable.
  const REAL = `MemTotal:       32797156 kB
MemFree:          412308 kB
MemAvailable:   20105044 kB
Buffers:            2048 kB
Cached:         18994412 kB
SwapCached:            0 kB
`;

  it("counts used as total minus available, not total minus free", () => {
    // Linux spends every spare byte on page cache. Subtracting MemFree would
    // report 98.7% used on a perfectly healthy machine — a permanently red
    // gauge that means nothing.
    const mem = parseMeminfo(REAL);
    expect(mem.totalBytes).toBe(32797156 * 1024);
    expect(mem.usedBytes).toBe((32797156 - 20105044) * 1024);
    expect(mem.usedBytes / mem.totalBytes).toBeLessThan(0.45);
  });

  it("falls back to MemFree when MemAvailable is absent", () => {
    // Pre-3.14 kernels. An over-reported figure beats no memory line at all.
    const old = REAL.split("\n")
      .filter((l) => !l.startsWith("MemAvailable"))
      .join("\n");
    expect(parseMeminfo(old).usedBytes).toBe((32797156 - 412308) * 1024);
  });

  it("throws when there is no MemTotal to divide by", () => {
    expect(() => parseMeminfo("Buffers: 2048 kB\n")).toThrow();
  });
});

describe("readThermal", () => {
  // Shaped after an AMI Redfish Chassis/Thermal payload — the BMC on
  // WhiteTower reports itself as "AMI Redfish Server", RedfishVersion 1.15.1.
  const THERMAL = {
    Temperatures: [
      { Name: "CPU0_TEMP", ReadingCelsius: 47, Status: { Health: "OK" } },
      { Name: "MB_TEMP", ReadingCelsius: 33, Status: { Health: "OK" } },
      // An unpopulated socket. Reads null, not zero.
      { Name: "CPU1_TEMP", ReadingCelsius: null, Status: { Health: "OK" } },
    ],
    Fans: [
      { Name: "FAN1", Status: { Health: "OK", State: "Enabled" } },
      { Name: "FAN2", Status: { Health: "OK", State: "Enabled" } },
      { Name: "FAN3", Status: { Health: "Critical", State: "Enabled" } },
    ],
  };

  it("names the warmest sensor", () => {
    expect(readThermal(THERMAL).hottest).toEqual({ name: "CPU0_TEMP", celsius: 47 });
  });

  it("skips a sensor with no reading rather than calling it 0°C", () => {
    // An empty socket reporting null would otherwise become the coldest
    // reading in the set — and, on a board where every sensor is empty, a
    // very calm-looking 0°C.
    const empty = { Temperatures: [{ Name: "CPU1_TEMP", ReadingCelsius: null }], Fans: [] };
    expect(readThermal(empty).hottest).toBeNull();
  });

  it("counts every fan and names only the ones the BMC calls unhealthy", () => {
    // The BMC's own verdict, never a threshold of ours — the same rule the
    // array follows for Unraid's disk colour.
    expect(readThermal(THERMAL).fans).toEqual({ total: 3, faulty: ["FAN3"] });
  });

  it("reports nothing rather than guessing when the payload is empty", () => {
    expect(readThermal({})).toEqual({ hottest: null, fans: { total: 0, faulty: [] } });
  });

  it("does not call a fan faulty when the BMC reports no health at all", () => {
    const unknown = { Temperatures: [], Fans: [{ Name: "FAN1" }] };
    expect(readThermal(unknown).fans).toEqual({ total: 1, faulty: [] });
  });
});
