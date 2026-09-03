import { describe, expect, it } from "vitest";
import { staleCollectors, systemProblems } from "@/components/home/stat-band";
import type { Gate, Systems } from "@/lib/systems";

/**
 * The Systems tile is the only real logic left in the band, and it is the one
 * that has to be right: it speaks for three collectors, two machines and eight
 * monitors in a single line of text.
 *
 * **It names rather than counts.** One problem reads as itself, several roll up
 * — the rule the monitors and the Home Assistant updates already use. A count
 * alone is a number you have to leave the page to decode.
 */
const CLEAR: Gate = {
  state: "clear",
  asOf: new Date("2026-09-02T20:00:00Z"),
  stale: false,
  monitorsUp: 8,
  monitorsTotal: 8,
  problems: [],
};

function systems(over: Partial<Systems> = {}): Systems {
  const fresh = { stale: false, asOf: new Date("2026-09-02T20:00:00Z") };

  return {
    kuma: { ...fresh, monitors: [], up: 8, down: 0 },
    ha: { ...fresh, updates: null, unavailable: null },
    server: { ...fresh, configured: true, vitals: null, hardware: null },
    unraid: { ...fresh, configured: true, array: null, parity: null },
    ...over,
  } as Systems;
}

describe("systemProblems", () => {
  it("finds nothing wrong with a clear house", () => {
    expect(systemProblems(CLEAR, systems())).toEqual({ red: [], amber: [] });
  });

  it("names a monitor that is down rather than counting it", () => {
    const gate: Gate = {
      ...CLEAR,
      state: "problems",
      monitorsUp: 7,
      problems: [{ kind: "down", name: "Plex", since: new Date() }],
    };

    expect(systemProblems(gate, systems()).red).toEqual(["Plex is down"]);
  });

  it("separates a disabled disk that still has parity behind it from one that does not", () => {
    // The distinction the whole `degraded` verdict exists for: one is running
    // on its spare, the other loses data on the next failure.
    const covered: Gate = {
      ...CLEAR,
      state: "degraded",
      problems: [{ kind: "degraded", disks: ["disk4"], spare: 1 }],
    };
    const exposed: Gate = {
      ...CLEAR,
      state: "problems",
      problems: [{ kind: "degraded", disks: ["disk4"], spare: 0 }],
    };

    expect(systemProblems(covered, systems())).toEqual({ red: [], amber: ["disk4 disabled"] });
    expect(systemProblems(exposed, systems()).red).toEqual(["disk4 disabled, no parity spare"]);
  });

  it("does not report a disabled disk's own errors twice", () => {
    // A disk Unraid has disabled is reported by the gate already; counting its
    // error column as a second condition would say one fault in two ways.
    const gate: Gate = {
      ...CLEAR,
      state: "degraded",
      problems: [{ kind: "degraded", disks: ["disk4"], spare: 1 }],
    };
    const sys = systems({
      unraid: {
        configured: true,
        stale: false,
        asOf: new Date(),
        parity: null,
        array: {
          state: "STARTED",
          disks: [
            { name: "disk4", role: "Data", status: "DISK_DSBL", colour: "red-on", tempC: null, errors: 128, sizeBytes: null, usedBytes: null },
          ],
          sizeBytes: null,
          usedBytes: null,
          disabled: ["disk4"],
          hottest: null,
        },
      },
    });

    expect(systemProblems(gate, sys).amber).toEqual(["disk4 disabled"]);
  });

  it("names one faulty fan and rolls up several", () => {
    const one = systems({
      server: {
        configured: true,
        stale: false,
        asOf: new Date(),
        vitals: null,
        hardware: { unreachable: null, health: "OK", hottest: null, fans: { total: 16, faulty: ["FAN3"] } },
      },
    });
    const many = systems({
      server: {
        configured: true,
        stale: false,
        asOf: new Date(),
        vitals: null,
        hardware: {
          unreachable: null,
          health: "OK",
          hottest: null,
          fans: { total: 16, faulty: ["FAN3", "FAN7", "FAN9"] },
        },
      },
    });

    expect(systemProblems(CLEAR, one).amber).toEqual(["FAN3 is not OK"]);
    expect(systemProblems(CLEAR, many).amber).toEqual(["3 fans are not OK"]);
  });

  it("treats an unreachable BMC as unknown rather than critical", () => {
    // It answered nothing, which is not the same as answering "Critical", and
    // reporting the machine as failing because its controller is asleep would
    // be the alarm crying wolf.
    const sys = systems({
      server: {
        configured: true,
        stale: false,
        asOf: new Date(),
        vitals: null,
        hardware: {
          unreachable: "timed out",
          health: null,
          hottest: null,
          fans: { total: 0, faulty: [] },
        },
      },
    });

    const { red, amber } = systemProblems(CLEAR, sys);
    expect(red).toEqual([]);
    expect(amber).toEqual(["the BMC will not answer"]);
  });
});

describe("staleCollectors", () => {
  it("says nothing when every source has answered", () => {
    expect(staleCollectors(CLEAR, systems())).toEqual([]);
  });

  it("names each source that is behind", () => {
    const stale = { stale: true, asOf: null };
    const sys = systems({
      unraid: { ...stale, configured: true, array: null, parity: null },
      ha: { ...stale, updates: null, unavailable: null },
    });

    expect(staleCollectors({ ...CLEAR, stale: true }, sys)).toEqual([
      "Uptime Kuma",
      "Unraid",
      "Home Assistant",
    ]);
  });

  it("does not call a source that was never configured 'behind'", () => {
    // Not connected and failing are different claims, and the band has said so
    // everywhere else since Horizon was wired up.
    const sys = systems({
      unraid: { configured: false, stale: true, asOf: null, array: null, parity: null },
      server: { configured: false, stale: true, asOf: null, vitals: null, hardware: null },
    });

    expect(staleCollectors(CLEAR, sys)).toEqual([]);
  });
});
