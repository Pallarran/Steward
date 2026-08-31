import { describe, expect, it } from "vitest";
import { parseIni, readDisks, readParity, summarise } from "@/lib/adapters/unraid";

/**
 * Shaped after WhiteTower's own files on 2026-08-31, with the drive serials
 * (`id`, `idSb`) removed — the repo is public and the adapter never stores them
 * either.
 *
 * The array is genuinely degraded in this sample, which is the point: disk4 is
 * `DISK_DSBL` and being emulated from parity, and it still reports a mounted
 * filesystem. A test written against a healthy array would not have caught
 * that a disabled disk must stay in the capacity total.
 */
const DISKS = `["parity"]
idx="0"
name="parity"
device="sdb"
size="11718885324"
status="DISK_OK"
temp="34"
numErrors="0"
type="Parity"
color="green-on"
["disk1"]
idx="1"
name="disk1"
device="sdc"
size="11718885324"
status="DISK_OK"
temp="31"
numErrors="0"
type="Data"
color="green-on"
fsType="zfs"
fsStatus="Mounted"
fsSize="11576279040"
fsFree="8826541712"
fsUsed="2749737328"
["disk4"]
idx="4"
name="disk4"
device="sdf"
size="11718885324"
status="DISK_DSBL"
temp="*"
numErrors="128"
type="Data"
color="red-on"
fsStatus="Mounted"
fsSize="11576279040"
fsFree="10576279040"
fsUsed="1000000000"
["disk5"]
idx="5"
name="disk5"
status="DISK_NP"
type="Data"
color="grey-off"
fsStatus="-"
["cache"]
idx="30"
name="cache"
status="DISK_OK"
temp="28"
numErrors="0"
type="Cache"
color="green-on"
fsStatus="Mounted"
fsSize="1000000000"
fsUsed="500000000"
`;

/** Flat — `var.ini` has no sections at all. */
const VAR_PAUSED = `version="7.3.2"
NAME="WhiteTower"
mdState="STARTED"
mdNumDisks="6"
mdNumInvalid="1"
mdResync="0"
mdResyncPos="5704864644"
mdResyncSize="11718885324"
mdResyncAction="check P Q"
sbSynced="1788048016"
sbSynced2="1788075023"
sbSyncErrs="0"
sbSyncExit="-4"
`;

describe("parseIni", () => {
  it("reads Unraid's bracketed-and-quoted section headers", () => {
    const parsed = parseIni(DISKS);
    expect(Object.keys(parsed)).toContain("disk1");
    expect(parsed.disk1.name).toBe("disk1");
    expect(parsed.disk1.fsType).toBe("zfs");
  });

  it("puts a section-less file under the empty key", () => {
    expect(parseIni(VAR_PAUSED)[""].mdState).toBe("STARTED");
  });
});

describe("readDisks", () => {
  it("drops empty slots but keeps every populated one", () => {
    const names = readDisks(DISKS).map((d) => d.name);
    expect(names).toEqual(["parity", "disk1", "disk4", "cache"]);
    expect(names).not.toContain("disk5");
  });

  it("reads a spun-down temperature as unknown, never as zero", () => {
    const disk4 = readDisks(DISKS).find((d) => d.name === "disk4")!;
    expect(disk4.tempC).toBeNull();
  });

  it("converts Unraid's 1024-byte blocks to bytes", () => {
    const disk1 = readDisks(DISKS).find((d) => d.name === "disk1")!;
    expect(disk1.sizeBytes).toBe(11576279040 * 1024);
    expect(disk1.usedBytes).toBe(2749737328 * 1024);
  });

  it("keeps no field that could identify the drive", () => {
    // The serial lives in `id` and `idSb`. Nothing on the page needs it and the
    // repo is public, so it must not survive into a fact.
    const keys = Object.keys(readDisks(DISKS)[0]);
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("device");
  });
});

describe("summarise", () => {
  const array = summarise(readDisks(DISKS), "STARTED");

  it("names every disabled disk", () => {
    expect(array.disabled).toEqual(["disk4"]);
  });

  it("counts a disabled disk toward capacity, because parity still serves it", () => {
    // Both data disks, not just the healthy one. The array has not shrunk —
    // Unraid is emulating disk4's contents, and dropping it from the total
    // would show a sudden 6 TB loss that has not happened.
    expect(array.sizeBytes).toBe(2 * 11576279040 * 1024);
    expect(array.usedBytes).toBe((2749737328 + 1000000000) * 1024);
  });

  it("leaves the cache pool out of the array total", () => {
    expect(array.sizeBytes).not.toBe(
      (11576279040 * 2 + 1000000000) * 1024,
    );
  });

  it("finds the warmest disk across every role, ignoring spun-down ones", () => {
    expect(array.hottest).toEqual({ name: "parity", tempC: 34 });
  });
});

describe("readParity", () => {
  it("calls a held position paused, not finished", () => {
    // The trap this exists for: sbSyncErrs is 0, and a check that has covered
    // 49% of the array with no errors is not a clean array. Anything reading
    // the error count without the position would say "clean".
    const parity = readParity(VAR_PAUSED);
    expect(parity.status).toBe("paused");
    expect(parity.percent).toBe(49);
    expect(parity.errors).toBe(0);
    expect(parity.action).toBe("check P Q");
  });

  it("calls it running while mdResync is non-zero", () => {
    const running = VAR_PAUSED.replace('mdResync="0"', 'mdResync="11718885324"');
    expect(readParity(running).status).toBe("running");
  });

  it("reads a rebuild as the operation it is", () => {
    const rebuild = VAR_PAUSED.replace('mdResyncAction="check P Q"', 'mdResyncAction="recon P Q"')
      .replace('mdResync="0"', 'mdResync="11718885324"');
    const parity = readParity(rebuild);
    expect(parity.status).toBe("running");
    expect(parity.action).toBe("recon P Q");
  });

  it("is idle with no position held, and reports no percentage", () => {
    const idle = VAR_PAUSED.replace('mdResyncPos="5704864644"', 'mdResyncPos="0"');
    const parity = readParity(idle);
    expect(parity.status).toBe("idle");
    expect(parity.percent).toBeNull();
  });

  it("survives a file that holds none of the fields", () => {
    const parity = readParity('NAME="WhiteTower"\n');
    expect(parity.status).toBe("idle");
    expect(parity.action).toBeNull();
    expect(parity.errors).toBe(0);
  });
});
