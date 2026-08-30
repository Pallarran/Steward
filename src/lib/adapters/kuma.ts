import { prisma } from "@/lib/db/prisma";
import type { MonitorStatus } from "@/generated/prisma/enums";
import { request } from "./http";
import type { Adapter } from "./types";

const TIMEOUT_MS = 10_000;

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
};

const LINE = /^monitor_status\{(.*)\}\s+([0-9]+)\s*$/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/** Prometheus escapes `\`, `"` and newlines in label values. */
function unescape(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c));
}

/**
 * Parses Uptime Kuma's Prometheus output.
 *
 * Only `monitor_status` is read. The response-time and certificate series are
 * ignored: nothing in v1 shows them, and normalizing at the edge means
 * emitting one shape rather than everything the source happens to offer.
 *
 * Exported so it can be tested against a captured sample without a live Kuma.
 */
export function parseMetrics(body: string): ParsedMonitor[] {
  const monitors: ParsedMonitor[] = [];

  for (const line of body.split("\n")) {
    const matched = LINE.exec(line.trim());
    if (!matched) continue;

    const labels: Record<string, string> = {};
    LABEL.lastIndex = 0;
    for (let m = LABEL.exec(matched[1]); m !== null; m = LABEL.exec(matched[1])) {
      labels[m[1]] = unescape(m[2]);
    }

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
    });
  }

  return monitors;
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
          changedAt: now,
          seenAt: now,
        },
      });
    }

    const down = monitors.filter((m) => m.status === "down").length;
    return `${monitors.length} monitors, ${down} down`;
  },
};
