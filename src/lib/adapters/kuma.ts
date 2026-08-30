import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { duration } from "@/lib/format";
import type { MonitorStatus } from "@/generated/prisma/enums";
import { request } from "./http";
import type { Adapter } from "./types";

const TIMEOUT_MS = 10_000;

/**
 * How many simultaneous outages become one row instead of several.
 *
 * A WhiteTower reboot takes everything down at once, and fifteen queue rows for
 * one event is exactly the failure the roll-up rule exists to prevent. It is
 * the same rule the Home Assistant adapter applies to HACS updates, wearing a
 * different costume.
 */
const ROLLUP_AT = 3;

/** Uptime Kuma's numeric status, from its own /metrics help text. */
const STATUS: Record<string, MonitorStatus> = {
  "0": "down",
  "1": "up",
  "2": "pending",
  "3": "maintenance",
};

export type ParsedMonitor = {
  name: string;
  url: string | null;
  type: string | null;
  status: MonitorStatus;
  /** Milliseconds. Null when Kuma publishes no response time for this monitor. */
  responseMs: number | null;
};

const STATUS_LINE = /^monitor_status\{(.*)\}\s+([0-9]+)\s*$/;
// Response times are floats, and Kuma writes `Nan` for a monitor that has none.
const RESPONSE_LINE = /^monitor_response_time\{(.*)\}\s+(\S+)\s*$/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/** Prometheus escapes `\`, `"` and newlines in label values. */
function unescape(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c));
}

function labelsIn(text: string): Record<string, string> {
  const labels: Record<string, string> = {};
  LABEL.lastIndex = 0;
  for (let m = LABEL.exec(text); m !== null; m = LABEL.exec(text)) {
    labels[m[1]] = unescape(m[2]);
  }
  return labels;
}

/**
 * Parses Uptime Kuma's Prometheus output.
 *
 * `monitor_status` is the identity and the state; `monitor_response_time` fills
 * the service tile's caption on the Systems page. The certificate series is
 * still ignored — normalizing at the edge means emitting one shape rather than
 * everything the source happens to offer.
 *
 * The response time is read **defensively**: a monitor type that reports none,
 * a `Nan`, or a Kuma that stops publishing the series all give null, and null
 * renders as no caption rather than as a zero.
 *
 * Exported so it can be tested against a captured sample without a live Kuma.
 */
export function parseMetrics(body: string): ParsedMonitor[] {
  const monitors: ParsedMonitor[] = [];
  const responses = new Map<string, number>();

  for (const raw of body.split("\n")) {
    const line = raw.trim();

    const response = RESPONSE_LINE.exec(line);
    if (response) {
      const name = labelsIn(response[1]).monitor_name;
      const ms = Number(response[2]);
      // Kuma writes `Nan` for a monitor it has no timing for. A negative or
      // absurd value is not worth showing either.
      if (name && Number.isFinite(ms) && ms >= 0) responses.set(name, Math.round(ms));
      continue;
    }

    const matched = STATUS_LINE.exec(line);
    if (!matched) continue;

    const labels = labelsIn(matched[1]);
    const name = labels.monitor_name;
    const status = STATUS[matched[2]];
    // A monitor with no name cannot be identified, and an unknown status code
    // would be guesswork. Skipping beats inventing either.
    if (!name || !status) continue;

    monitors.push({
      name,
      // Kuma writes the string "null" rather than omitting the label.
      url: labels.monitor_url && labels.monitor_url !== "null" ? labels.monitor_url : null,
      type: labels.monitor_type && labels.monitor_type !== "null" ? labels.monitor_type : null,
      status,
      responseMs: null,
    });
  }

  // Joined after the fact, because the two series are separate blocks in the
  // body and the response times may appear before the statuses.
  return monitors.map((m) => ({ ...m, responseMs: responses.get(m.name) ?? null }));
}

/**
 * Uptime Kuma, read through /metrics.
 *
 * Chosen over the status-page JSON because /metrics covers every monitor,
 * while the status-page route only covers monitors added to a status page by
 * hand — a collector that silently ignores a monitor is exactly the failure
 * rule 2 exists to prevent. The cost is that /metrics carries no monitor id
 * and no incident history: the name is the identity, and "down since" is
 * inferred from transitions here.
 *
 * No conditional request. The body carries response times that change on every
 * scrape, so an ETag would never match and the round trip would be wasted.
 */
export const kumaAdapter: Adapter = {
  key: "kuma",
  intervalSeconds: 60,

  async run(now) {
    const base = process.env.KUMA_BASE_URL;
    const key = process.env.KUMA_KEY;
    if (!base || !key) throw new Error("KUMA_BASE_URL and KUMA_KEY are not set");

    const response = await request(new URL("/metrics", base), {
      // Basic auth with an empty username, which is how Kuma takes an API key.
      headers: { Authorization: `Basic ${Buffer.from(`:${key}`).toString("base64")}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Uptime Kuma answered ${response.status} ${response.statusText}`);
    }

    const monitors = parseMetrics(await response.text());

    // An empty parse means Kuma answered with something we do not understand.
    // Writing it through would silently empty the gate and read as "all clear".
    if (monitors.length === 0) {
      throw new Error("Uptime Kuma returned no monitor_status lines");
    }

    for (const m of monitors) {
      const existing = await prisma.monitor.findUnique({ where: { name: m.name } });

      await prisma.monitor.upsert({
        where: { name: m.name },
        update: {
          url: m.url,
          type: m.type,
          status: m.status,
          responseMs: m.responseMs,
          // changedAt only moves on a real transition, so "down for 41
          // minutes" counts from the right moment rather than from this poll.
          ...(existing && existing.status !== m.status ? { changedAt: now } : {}),
          seenAt: now,
        },
        create: {
          name: m.name,
          url: m.url,
          type: m.type,
          status: m.status,
          responseMs: m.responseMs,
          changedAt: now,
          seenAt: now,
        },
      });
    }

    const down = await syncDownItems(now);
    return `${monitors.length} monitors, ${down} down`;
  },
};

/**
 * The queue half of PRD component 1. Step 5 built the panel only.
 *
 * Rows leave by being **deleted** when a service recovers, not by being
 * dismissed. Rule 3 reserves dismissal for things where "gone" is true and
 * final, and a monitor being down is neither — it resolves on its own. So
 * dismissing one of these means "I know, I am on it", and the row still
 * disappears by itself the moment the service answers again.
 *
 * Returns how many monitors are down, for the run summary.
 */
async function syncDownItems(now: Date): Promise<number> {
  // Read back rather than reusing the parsed list, because `changedAt` is the
  // detail worth showing and only the table knows it.
  const down = await prisma.monitor.findMany({
    where: { status: "down", seenAt: now },
    orderBy: { name: "asc" },
  });

  const base = process.env.KUMA_BASE_URL;
  const url = base ? new URL("/dashboard", base).toString() : null;
  const wanted: string[] = [];

  if (down.length >= ROLLUP_AT) {
    const names = down.map((m) => m.name);
    // The id is a digest of exactly which services are down, so a row for
    // "5 services" does not silently become a row for a different five.
    const digest = crypto.createHash("sha1").update(names.join(",")).digest("hex").slice(0, 12);
    const externalId = `down:rollup:${digest}`;
    wanted.push(externalId);

    await upsertDownItem({
      externalId,
      title: `${down.length} services are not responding`,
      subtitle:
        names.slice(0, 4).join(", ") + (names.length > 4 ? `, and ${names.length - 4} more` : ""),
      url,
      // The oldest transition: the outage started when the first one fell over.
      occurredAt: down.reduce((a, b) => (a.changedAt < b.changedAt ? a : b)).changedAt,
      now,
    });
  } else {
    for (const monitor of down) {
      const externalId = `down:${monitor.name}`;
      wanted.push(externalId);

      await upsertDownItem({
        externalId,
        title: `${monitor.name} is not responding`,
        // A duration rather than a clock time: an outage that crosses midnight
        // makes "down since 08:57" ambiguous, and this row is rewritten every
        // poll anyway.
        subtitle: `down for ${duration(monitor.changedAt, now)}`,
        // Kuma's dashboard, not the service's own URL — the service is down, so
        // its own address is the one link guaranteed not to answer.
        url,
        occurredAt: monitor.changedAt,
        now,
      });
    }
  }

  // Built conditionally: an empty `notIn` is not something to bet a collector
  // that runs every minute on.
  await prisma.item.deleteMany({
    where: {
      source: "kuma",
      externalId: wanted.length > 0 ? { startsWith: "down:", notIn: wanted } : { startsWith: "down:" },
    },
  });

  return down.length;
}

async function upsertDownItem(args: {
  externalId: string;
  title: string;
  subtitle: string;
  url: string | null;
  occurredAt: Date;
  now: Date;
}) {
  await prisma.item.upsert({
    where: { source_externalId: { source: "kuma", externalId: args.externalId } },
    // status untouched: an outage acknowledged stays acknowledged, and the row
    // leaves on recovery rather than on a second glance.
    update: { title: args.title, subtitle: args.subtitle, url: args.url },
    create: {
      source: "kuma",
      externalId: args.externalId,
      category: "systems",
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      // Top of the queue. Nothing else in v1 outranks the house being broken.
      priority: 0,
      occurredAt: args.occurredAt,
    },
  });
}
