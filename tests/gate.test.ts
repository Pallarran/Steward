import { describe, expect, it } from "vitest";
import { gateVerdict } from "@/lib/systems";

/**
 * The gate said "All clear" with a disabled array disk, and the rail's Systems
 * dot stayed green, because nothing in v1 had a word for a house that is
 * running on its spare rather than broken. These are that word's edges.
 */
describe("gateVerdict", () => {
  it("is clear with nothing down and nothing disabled", () => {
    expect(gateVerdict({ down: 0, disabled: 0, spare: 2 })).toBe("clear");
  });

  it("is degraded — not clear — with a disabled disk and redundancy left", () => {
    // Dual parity, one disk emulated: everything reads and the replacement can
    // arrive tomorrow. Amber, because green would be a lie and red would cry
    // wolf.
    expect(gateVerdict({ down: 0, disabled: 1, spare: 1 })).toBe("degraded");
  });

  it("is a problem once the redundancy is gone", () => {
    // Two disabled against two parity devices. The next failure costs data,
    // which belongs with the services that are down rather than beside them.
    expect(gateVerdict({ down: 0, disabled: 2, spare: 0 })).toBe("problems");
  });

  it("is a problem with a single-parity array and one disk disabled", () => {
    expect(gateVerdict({ down: 0, disabled: 1, spare: 0 })).toBe("problems");
  });

  it("lets a service being down outrank a healthy array", () => {
    expect(gateVerdict({ down: 1, disabled: 0, spare: 2 })).toBe("problems");
  });

  it("stays a problem when both are wrong at once", () => {
    expect(gateVerdict({ down: 1, disabled: 1, spare: 1 })).toBe("problems");
  });
});
