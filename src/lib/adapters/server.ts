import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { writeFact } from "@/lib/facts";
import type { Adapter } from "./types";

/**
 * The machine, as distinct from its array.
 *
 * `unraid.ts` reports the array — disks, parity, capacity. This reports the box
 * underneath it, and it takes **two sources** because they know different
 * things and neither can answer for the other:
 *
 * - **`/proc`** knows what the operating system is doing: how long it has been
 *   up, how loaded it is, how much of its memory is in use. Redfish reports
 *   installed memory and never used.
 * - **The BMC**, over Redfish, knows what the hardware is doing: temperatures,
 *   fans, and its own health verdict. It knows nothing about uptime.
 *
 * **One collector, two facts, and one deliberate asymmetry in how they fail.**
 * Reading a local file cannot fail the way a network call to an embedded
 * controller can, so a BMC that does not answer is recorded as unreachable
 * *inside* `server:hardware`, with its reason, and does not throw. The card
 * then shows uptime and memory normally and says the BMC is not answering,
 * which is more precise than dimming the whole card amber. Rule 2 is satisfied
 * because the failure is named on screen rather than hidden behind a stale
 * zero. If `/proc` fails the adapter does throw, because then it knows nothing.
 */

export const SERVER_VITALS = "server:vitals";
export const SERVER_HARDWARE = "server:hardware";

const TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------------ facts */

export type VitalsFact = {
  /** Seconds since boot. */
  uptimeSeconds: number;
  /** 1, 5 and 15 minute load averages. */
  load: [number, number, number];
  memTotalBytes: number;
  /**
   * `MemTotal - MemAvailable`.
   *
   * **Not `MemTotal - MemFree`.** Linux spends every spare byte on page cache,
   * so free memory on a healthy fileserver is near zero and that subtraction
   * would report a permanently full machine. `MemAvailable` is the kernel's own
   * estimate of what a new process could actually get, which is the number a
   * person means by "used".
   */
  memUsedBytes: number;
};

export type HardwareFact = {
  /** Null when it answered. A string is the reason it did not. */
  unreachable: string | null;
  /** The BMC's own verdict: `OK`, `Warning`, `Critical`. Never ours. */
  health: string | null;
  /** The warmest sensor it reports, named. Null when it reports none. */
  hottest: { name: string; celsius: number } | null;
  fans: { total: number; /** Any not reporting OK, by name. */ faulty: string[] };
};

/* ----------------------------------------------------------------- /proc */

/**
 * `12345.67 89012.34` — seconds since boot, then idle-seconds across cores.
 *
 * The emptiness check is not defensive noise. `Number("")` is `0`, so a
 * truncated or unreadable file would have parsed cleanly as a machine that
 * booted this instant — which is exactly the shape of thing rule 2 exists to
 * stop, and it is far better to throw and turn the card amber.
 */
export function parseUptime(text: string): number {
  const first = text.trim().split(/\s+/)[0] ?? "";
  if (first === "") throw new Error("uptime is empty");

  const seconds = Number(first);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("uptime is not a number");
  return seconds;
}

/** `0.82 1.10 0.94 2/1387 30021` — the three averages, then unrelated fields. */
export function parseLoadavg(text: string): [number, number, number] {
  const parts = text.trim().split(/\s+/).slice(0, 3).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("loadavg is not three numbers");
  }
  return [parts[0], parts[1], parts[2]];
}

/** `MemTotal:  32797156 kB` — a labelled table, in kibibytes throughout. */
export function parseMeminfo(text: string): { totalBytes: number; usedBytes: number } {
  const field = (name: string): number | null => {
    const found = new RegExp(`^${name}:\\s+(\\d+)\\s*kB`, "m").exec(text);
    return found ? Number(found[1]) * 1024 : null;
  };

  const total = field("MemTotal");
  const available = field("MemAvailable");
  if (total === null) throw new Error("meminfo has no MemTotal");

  // MemAvailable arrived in Linux 3.14 and is present on anything Unraid runs,
  // but falling back to MemFree beats throwing: an over-reported figure is
  // still a figure, and the alternative is no memory line at all.
  const free = available ?? field("MemFree") ?? 0;

  return { totalBytes: total, usedBytes: Math.max(0, total - free) };
}

async function readVitals(dir: string): Promise<VitalsFact> {
  const [uptime, loadavg, meminfo] = await Promise.all([
    readFile(path.join(dir, "uptime"), "utf8"),
    readFile(path.join(dir, "loadavg"), "utf8"),
    readFile(path.join(dir, "meminfo"), "utf8"),
  ]);

  const mem = parseMeminfo(meminfo);

  return {
    uptimeSeconds: parseUptime(uptime),
    load: parseLoadavg(loadavg),
    memTotalBytes: mem.totalBytes,
    memUsedBytes: mem.usedBytes,
  };
}

/* --------------------------------------------------------------- Redfish */

/**
 * One GET against the BMC.
 *
 * **`node:https` rather than `fetch`, and the reason matters.** The BMC serves
 * a self-signed certificate, which `fetch` refuses. The global escape hatch —
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` — would switch off verification for Horizon,
 * Todoist and Home Assistant as well, which is far too big a hammer for one LAN
 * appliance. Scoping `rejectUnauthorized` to this request is the narrow fix.
 * `undici`'s dispatcher would do the same thing, at the cost of a dependency
 * that pnpm's strict layout makes fragile to reach for transitively.
 */
function redfish<T>(base: string, at: string, auth: string): Promise<T> {
  const url = new URL(at, base);

  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        rejectUnauthorized: false,
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status === 401) {
            return reject(new Error("the BMC rejected BMC_USER and BMC_PASSWORD"));
          }
          if (status < 200 || status >= 300) {
            return reject(new Error(`the BMC answered ${status} for ${at}`));
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch {
            reject(new Error(`the BMC returned something that is not JSON for ${at}`));
          }
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error("the BMC did not answer in time")));
    request.on("error", (err) => reject(err));
    request.end();
  });
}

type Member = { "@odata.id": string };
type Collection = { Members?: Member[] };
type Sensor = { Name?: string; ReadingCelsius?: number | null; Status?: { Health?: string } };
type Fan = { Name?: string; Status?: { Health?: string; State?: string } };

/**
 * Reduce a Redfish `Thermal` document to the two things the card shows.
 *
 * Exported for tests, because this is where a vendor's payload meets our
 * assumptions and the AMI shape is the one thing here worth pinning.
 *
 * **A sensor with no reading is skipped, never read as zero** — an unpopulated
 * socket reports `null`, and a 0 °C CPU would be a very calm-looking fault.
 * Fans are counted as faulty on the BMC's own `Health`, never on a threshold of
 * ours, for the same reason the array trusts Unraid's disk colour.
 */
export function readThermal(doc: { Temperatures?: Sensor[]; Fans?: Fan[] }): {
  hottest: HardwareFact["hottest"];
  fans: HardwareFact["fans"];
} {
  const readings = (doc.Temperatures ?? []).filter(
    (t): t is Sensor & { ReadingCelsius: number } =>
      typeof t.ReadingCelsius === "number" && Number.isFinite(t.ReadingCelsius),
  );

  const hottest = readings.reduce<HardwareFact["hottest"]>((best, t) => {
    if (best && best.celsius >= t.ReadingCelsius) return best;
    return { name: t.Name ?? "unnamed sensor", celsius: t.ReadingCelsius };
  }, null);

  const fans = doc.Fans ?? [];

  return {
    hottest,
    fans: {
      total: fans.length,
      faulty: fans
        .filter((f) => f.Status?.Health !== undefined && f.Status.Health !== "OK")
        .map((f) => f.Name ?? "unnamed fan"),
    },
  };
}

/**
 * Everything the BMC contributes, or the reason it contributed nothing.
 *
 * **Follows links rather than guessing paths.** Redfish is self-describing, and
 * `/redfish/v1/Chassis` names its own members — hardcoding `/Chassis/1` would
 * work on this board and break on the next one, for no gain.
 */
async function readHardware(): Promise<HardwareFact> {
  const empty: HardwareFact = {
    unreachable: null,
    health: null,
    hottest: null,
    fans: { total: 0, faulty: [] },
  };

  const base = process.env.BMC_BASE_URL;
  const user = process.env.BMC_USER;
  const password = process.env.BMC_PASSWORD;

  if (!base || !user || !password) {
    return { ...empty, unreachable: "not configured" };
  }

  const auth = Buffer.from(`${user}:${password}`).toString("base64");

  try {
    const [systems, chassis] = await Promise.all([
      redfish<Collection>(base, "/redfish/v1/Systems", auth),
      redfish<Collection>(base, "/redfish/v1/Chassis", auth),
    ]);

    const system = systems.Members?.[0]?.["@odata.id"];
    const box = chassis.Members?.[0]?.["@odata.id"];

    const [health, thermal] = await Promise.all([
      system
        ? redfish<{ Status?: { Health?: string } }>(base, system, auth)
        : Promise.resolve(null),
      box
        ? redfish<{ Temperatures?: Sensor[]; Fans?: Fan[] }>(base, `${box}/Thermal`, auth)
        : Promise.resolve(null),
    ]);

    return {
      unreachable: null,
      health: health?.Status?.Health ?? null,
      ...(thermal ? readThermal(thermal) : { hottest: null, fans: { total: 0, faulty: [] } }),
    };
  } catch (err) {
    // Recorded, not thrown. The /proc half succeeded and the card can say both
    // things at once: here is your uptime, and the BMC is not answering.
    return { ...empty, unreachable: err instanceof Error ? err.message : "the BMC did not answer" };
  }
}

/* ----------------------------------------------------------------- adapter */

/**
 * Five minutes.
 *
 * `/proc` costs nothing, but the BMC is a small embedded controller sharing a
 * management chip with the web UI, and nothing it reports — a fan speed, a
 * package temperature — moves meaningfully faster than that.
 */
export const serverAdapter: Adapter = {
  key: "server",
  intervalSeconds: 300,

  async run(now) {
    const dir = process.env.HOST_PROC_DIR;
    if (!dir) throw new Error("HOST_PROC_DIR is not set");

    const vitals = await readVitals(dir);
    const hardware = await readHardware();

    await writeFact(SERVER_VITALS, "server", vitals, now);
    await writeFact(SERVER_HARDWARE, "server", hardware, now);

    const days = Math.floor(vitals.uptimeSeconds / 86_400);
    const bmc = hardware.unreachable
      ? `bmc ${hardware.unreachable}`
      : `bmc ${(hardware.health ?? "unknown").toLowerCase()}, ${hardware.fans.total} fans`;

    return `up ${days}d, load ${vitals.load[0].toFixed(2)}, ${bmc}`;
  },
};
