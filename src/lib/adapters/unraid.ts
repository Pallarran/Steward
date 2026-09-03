import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { writeFact } from "@/lib/facts";
import type { Adapter } from "./types";
import { ALARM_PRIORITY } from "@/lib/priority";

/**
 * Unraid, read from its own state files.
 *
 * **The PRD's three candidates were all wrong**, and the reasoning is worth
 * keeping. It offered the GraphQL API, the HACS integration or an MQTT script —
 * every one of which means installing something and holding a credential. But
 * Steward runs *on* WhiteTower, and Unraid's webGUI reads its state from plain
 * ini files in `/var/local/emhttp`, mode 644 on a RAM disk. A read-only bind
 * mount gives the same numbers the Dashboard draws, with no plugin, no API key
 * and no Unraid Connect account.
 *
 * Two files:
 *
 * - `disks.ini` — one section per slot, including empty ones, with status,
 *   temperature, error counts and filesystem usage.
 * - `var.ini` — flat, and holds the array state plus whatever parity operation
 *   is running.
 *
 * **What this deliberately cannot read.** `/boot/config/parity-checks.log` is
 * the history of *completed* checks, and it is mode 600 on a FAT32 volume whose
 * permissions come from the mount options rather than the file — there is
 * nothing to chmod, and the container runs as uid 1001. So Steward reports the
 * operation in front of it and never claims to know when one last finished.
 *
 * **Never store a drive's `id` or `idSb`.** Those are serial numbers, the repo
 * is public, and nothing on the page needs them.
 */

/** Where the read-only mount lands. Unset means Unraid is simply not wired up. */
const STATE_DIR = () => process.env.UNRAID_STATE_DIR;

export const UNRAID_ARRAY = "unraid:array";
export const UNRAID_PARITY = "unraid:parity";

/* ------------------------------------------------------------------ facts */

export type DiskFact = {
  /** `parity`, `disk1`, `cache` — the slot, which is also how Unraid names it. */
  name: string;
  /** `Parity`, `Data`, `Cache`, `Flash`. */
  role: string;
  /** Unraid's own word: `DISK_OK`, `DISK_DSBL`, `DISK_NP`, `DISK_INVALID`. */
  status: string;
  /**
   * Unraid's own verdict, not ours: `green-on`, `red-on`, `grey-off`.
   *
   * Steward reports what Unraid already decided rather than inventing a
   * threshold of its own. A dashboard that disagrees with the machine it is
   * describing is worse than one that says nothing.
   */
  colour: string;
  /** Null when the disk is spun down or has no sensor — never zero. */
  tempC: number | null;
  errors: number;
  sizeBytes: number | null;
  usedBytes: number | null;
};

export type ArrayFact = {
  /** `STARTED`, `STOPPED`. */
  state: string;
  disks: DiskFact[];
  /** Across mounted data disks. Null when none of them report a filesystem. */
  sizeBytes: number | null;
  usedBytes: number | null;
  /** Slots whose contents Unraid is emulating from parity. The headline. */
  disabled: string[];
  hottest: { name: string; tempC: number } | null;
};

export type ParityFact = {
  /** `check P Q`, `recon P Q`, `clear`. Null when nothing has ever run. */
  action: string | null;
  /**
   * - `running` — an operation is under way now.
   * - `paused` — a position is held but nothing is moving. On this machine that
   *   is the Parity Check Tuning plugin standing down for temperature and it
   *   will resume by itself; an abandoned check looks **identical** in these
   *   fields, so Steward says "paused" and does not editorialise further.
   * - `idle` — nothing running and no position held.
   */
  status: "running" | "paused" | "idle";
  /** 0 to 100, null when idle. */
  percent: number | null;
  /**
   * `sbSyncErrs`, the sync error count.
   *
   * **Only meaningful alongside `percent`.** Zero errors on a check that has
   * covered half the array is not a clean array, and reporting it as one would
   * be rule 2's exact failure. The card always says the percentage next to it.
   */
  errors: number;
  /** Unix seconds. `sbSynced` is the start, `sbSynced2` the last update. */
  startedAt: string | null;
  updatedAt: string | null;
};

/* ----------------------------------------------------------------- parsing */

/**
 * Unraid's ini dialect: `key="value"` lines, and `["name"]` section headers
 * with the quotes *inside* the brackets. `var.ini` has no sections at all, so
 * its keys land under the empty-string key.
 */
export function parseIni(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = { "": {} };
  let section = "";

  for (const line of text.split(/\r?\n/)) {
    const header = /^\[\s*"?([^"\]]*)"?\s*\]$/.exec(line.trim());
    if (header) {
      section = header[1];
      out[section] ??= {};
      continue;
    }

    const pair = /^([A-Za-z0-9_.]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (pair) out[section][pair[1]] = pair[2];
  }

  return out;
}

/** Unraid counts in 1024-byte blocks throughout. Blank and `-` mean unknown. */
function blocksToBytes(raw: string | undefined): number | null {
  if (!raw || raw === "-") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n * 1024 : null;
}

function toInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** `temp` is `*` on a spun-down disk, which is unknown rather than cold. */
function toTemp(raw: string | undefined): number | null {
  if (!raw || raw === "*") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function readDisks(disksIni: string): ArrayFact["disks"] {
  const sections = parseIni(disksIni);

  return Object.entries(sections)
    .filter(([name, fields]) => name !== "" && fields.name)
    // `DISK_NP` is an empty slot — Unraid lists all eight whether or not
    // anything is in them, and a card listing four absences is noise.
    .filter(([, fields]) => fields.status !== "DISK_NP")
    .map(([, f]) => ({
      name: f.name,
      role: f.type ?? "Data",
      status: f.status ?? "",
      colour: f.color ?? "",
      tempC: toTemp(f.temp),
      errors: toInt(f.numErrors, 0),
      sizeBytes: blocksToBytes(f.fsSize),
      usedBytes: blocksToBytes(f.fsUsed),
    }));
}

export function summarise(disks: DiskFact[], state: string): ArrayFact {
  const data = disks.filter((d) => d.role === "Data");

  const sized = data.filter((d) => d.sizeBytes !== null && d.usedBytes !== null);
  const withTemp = disks.filter((d): d is DiskFact & { tempC: number } => d.tempC !== null);

  return {
    state,
    disks,
    // A disabled disk still reports its filesystem, because Unraid emulates it
    // from parity — so it belongs in the total. The array has not shrunk.
    sizeBytes: sized.length > 0 ? sized.reduce((n, d) => n + d.sizeBytes!, 0) : null,
    usedBytes: sized.length > 0 ? sized.reduce((n, d) => n + d.usedBytes!, 0) : null,
    disabled: disks.filter((d) => d.status === "DISK_DSBL").map((d) => d.name),
    // Narrowed to the two fields the type declares, not the whole disk.
    // `reduce` hands back the `DiskFact` it picked, and TypeScript accepts that
    // against `{ name, tempC }` because excess-property checks only fire on
    // object literals — so the fact would have quietly stored a second copy of
    // a disk row. A fact should hold exactly what its type says it holds.
    hottest:
      withTemp.length > 0
        ? (({ name, tempC }) => ({ name, tempC }))(
            withTemp.reduce((a, b) => (a.tempC >= b.tempC ? a : b), withTemp[0]),
          )
        : null,
  };
}

export function readParity(varIni: string): ParityFact {
  const v = parseIni(varIni)[""];

  // `mdResync` is the size of the operation *in flight* and drops to 0 the
  // moment it stops, while `mdResyncPos` keeps the position it reached. The
  // two together are what separates running from paused.
  const running = toInt(v.mdResync, 0) !== 0;
  const position = toInt(v.mdResyncPos, 0);
  const total = toInt(v.mdResyncSize, 0);

  const percent =
    total > 0 && position > 0 ? Math.min(100, Math.round((position / total) * 100)) : null;

  return {
    action: v.mdResyncAction || null,
    status: running ? "running" : position > 0 ? "paused" : "idle",
    percent,
    errors: toInt(v.sbSyncErrs, 0),
    startedAt: v.sbSynced || null,
    updatedAt: v.sbSynced2 || null,
  };
}

/* ----------------------------------------------------------------- adapter */

/**
 * Two minutes. These are two small files on a RAM disk on the same host, so the
 * read costs nothing — but nothing here moves faster than that either, and a
 * fifteen-hour rebuild does not need sixty-second resolution.
 */
export const unraidAdapter: Adapter = {
  key: "unraid",
  intervalSeconds: 120,

  async run(now) {
    const dir = STATE_DIR();
    if (!dir) throw new Error("UNRAID_STATE_DIR is not set");

    const [disksIni, varIni] = await Promise.all([
      readFile(path.join(dir, "disks.ini"), "utf8"),
      readFile(path.join(dir, "var.ini"), "utf8"),
    ]);

    const disks = readDisks(disksIni);
    const state = parseIni(varIni)[""].mdState ?? "";

    // An array that reports no disks is a parse that failed, not an empty
    // machine. Writing it through would blank the card and call it healthy.
    if (disks.length === 0) throw new Error("Unraid reported no disks");

    const array = summarise(disks, state);
    const parity = readParity(varIni);

    await writeFact(UNRAID_ARRAY, "unraid", array, now);
    await writeFact(UNRAID_PARITY, "unraid", parity, now);

    await syncDiskItems(array, now);

    const trouble = array.disabled.length > 0 ? `, ${array.disabled.join(" and ")} disabled` : "";
    return `${state.toLowerCase()}, ${disks.length} disks${trouble}, parity ${parity.status}`;
  },
};

/**
 * The queue half of PRD component 1, for Unraid.
 *
 * **One row for the array, never one per disk.** The roll-up rule: many rows,
 * one event. Two disks failing at once is one thing that has happened to one
 * machine, and it needs one line, not two.
 *
 * Like the monitors-down row, this **leaves by being deleted** when the array
 * is healthy again, not by being dismissed — rule 3 reserves dismissal for
 * things where "gone" is true and final, and a rebuilt disk is neither.
 * Dismissing it therefore means "I know, I have ordered the drive", and the row
 * still disappears by itself the moment Unraid stops emulating.
 *
 * The id carries the disk names, so a row about disk4 cannot quietly become a
 * row about disk4 and disk7.
 */
async function syncDiskItems(array: ArrayFact, now: Date): Promise<void> {
  const disabled = array.disabled;
  const externalId = disabled.length > 0 ? `disk:${disabled.join(",")}` : null;

  if (externalId) {
    const names = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
      disabled,
    );

    await prisma.item.upsert({
      where: { source_externalId: { source: "unraid", externalId } },
      // status untouched, for the same reason the monitors-down row leaves it:
      // acknowledged stays acknowledged.
      update: {
        title: `${names} ${disabled.length === 1 ? "is" : "are"} disabled on WhiteTower`,
        subtitle: "Contents are being emulated from parity",
        // See lib/priority.ts: a rung outside the update clause cannot move a
        // row that already exists.
        priority: ALARM_PRIORITY,
      },
      create: {
        source: "unraid",
        externalId,
        category: "systems",
        title: `${names} ${disabled.length === 1 ? "is" : "are"} disabled on WhiteTower`,
        subtitle: "Contents are being emulated from parity",
        // An alarm, not a high priority — see lib/priority.ts.
        priority: ALARM_PRIORITY,
        occurredAt: now,
      },
    });
  }

  await prisma.item.deleteMany({
    where: {
      source: "unraid",
      externalId: externalId
        ? { startsWith: "disk:", not: externalId }
        : { startsWith: "disk:" },
    },
  });
}
