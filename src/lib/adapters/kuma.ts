import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { duration } from "@/lib/format";
import type { MonitorStatus } from "@/generated/prisma/enums";
import { request } from "./http";
import type { Adapter } from "./types";
import { ALARM_PRIORITY, PRIORITY } from "@/lib/priority";
import { CERT_WARN_DAYS } from "@/lib/service";

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
  /** Days of TLS certificate left. Null when this monitor has no certificate. */
  certDays: number | null;
};

const STATUS_LINE = /^monitor_status\{(.*)\}\s+([0-9]+)\s*$/;
// Response times are floats, and Kuma writes `Nan` for a monitor that has none.
const RESPONSE_LINE = /^monitor_response_time\{(.*)\}\s+(\S+)\s*$/;
const CERT_LINE = /^monitor_cert_days_remaining\{(.*)\}\s+(\S+)\s*$/;
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
 * All three series Kuma publishes. `monitor_status` is the identity and the
 * state; `monitor_response_time` and `monitor_cert_days_remaining` fill the
 * service card's caption.
 *
 * **The certificate joined on 2026-09-03**, having been ignored on the argument
 * that normalizing at the edge means emitting one shape rather than everything
 * the source offers. That argument holds for a series nothing renders, and this
 * one is now the only thing on a card that is actionable while the service is
 * still up: a certificate expiring in nine days is a service about to break.
 *
 * Both numbers are read **defensively**: a monitor type that reports none, a
 * `Nan`, or a Kuma that stops publishing a series all give null, and null
 * renders as absent rather than as a zero. That matters most for the
 * certificate, where zero means *expired*.
 *
 * Exported so it can be tested against a captured sample without a live Kuma.
 */
export function parseMetrics(body: string): ParsedMonitor[] {
  const monitors: ParsedMonitor[] = [];
  const responses = new Map<string, number>();
  const certs = new Map<string, number>();

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

    const cert = CERT_LINE.exec(line);
    if (cert) {
      const name = labelsIn(cert[1]).monitor_name;
      const days = Number(cert[2]);
      // Zero is kept, unlike the response time's floor: a certificate with zero
      // days left has expired, which is the single most worth saying. Negative
      // is Kuma reporting one that expired a while ago, and is floored at zero
      // rather than dropped.
      if (name && Number.isFinite(days)) certs.set(name, Math.max(0, Math.round(days)));
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
      certDays: null,
    });
  }

  // Joined after the fact, because the three series are separate blocks in the
  // body and either number may appear before the statuses.
  return monitors.map((m) => ({
    ...m,
    responseMs: responses.get(m.name) ?? null,
    certDays: certs.get(m.name) ?? null,
  }));
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
          certDays: m.certDays,
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
          certDays: m.certDays,
          changedAt: now,
          seenAt: now,
          // Left to the column default on purpose — this *is* the moment
          // Steward started watching, and an uptime figure must not claim to
          // cover any time before it.
        },
      });

      await recordOutage(m.name, existing, m.status, now);
    }

    const down = await syncDownItems(now);
    const certs = await syncCertItems(now);
    return `${monitors.length} monitors, ${down} down, ${certs} certs expiring`;
  },
};

/**
 * Opens and closes an outage, at the transition the upsert above already
 * detects.
 *
 * **Two rows per outage, not a sample per minute.** Uptime Kuma keeps the
 * heartbeat history and will not publish it — its percentages need a numeric
 * monitor id `/metrics` does not expose, and the alternative is a socket.io
 * subscription that rule 6 rules out. So Steward keeps the only shape it can
 * observe from a poll: when something fell over and when it came back.
 *
 * `updateMany` rather than `update`, so a duplicate open row left by a crash
 * mid-write is closed on the next transition instead of accumulating for ever.
 *
 * A restart while a service is down opens nothing new — the previous status was
 * already `down` — and the open row stays open, which is the right answer. The
 * cost is the one `changedAt` already carries: a service that fell over while
 * Steward was stopped is dated from the first poll after it came back up.
 */
async function recordOutage(
  monitor: string,
  existing: { status: MonitorStatus; changedAt: Date } | null,
  is: MonitorStatus,
  now: Date,
): Promise<void> {
  const was = existing?.status ?? null;

  if (is !== "down") {
    if (was === "down") {
      await prisma.monitorOutage.updateMany({
        where: { monitor, endedAt: null },
        data: { endedAt: now },
      });
    }
    return;
  }

  // First sight of a monitor that is already down still opens one: it is down,
  // and the record should say so from the moment Steward could see it.
  if (was !== "down") {
    await prisma.monitorOutage.create({ data: { monitor, startedAt: now } });
    return;
  }

  // Still down, and no transition to hang an outage on.
  //
  // **This is the state the very first poll after this shipped will be in** for
  // anything already broken, and without it that outage would never be recorded
  // at all — the one Vincent is most likely to be looking at while he deploys.
  // It is also the repair for a row lost to a crash between the create and the
  // commit. `changedAt` is when the transition was seen, which is a better
  // start than now and the best available.
  const open = await prisma.monitorOutage.findFirst({ where: { monitor, endedAt: null } });
  if (!open) {
    await prisma.monitorOutage.create({ data: { monitor, startedAt: existing!.changedAt } });
  }
}

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
    // `priority` is in the update as well as the create, per lib/priority.ts.
    // Inert while the only rung this writes is the alarm — and exactly the
    // omission that made the Todoist Inbox unmovable, so it does not stay.
    update: {
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      priority: ALARM_PRIORITY,
    },
    create: {
      source: "kuma",
      externalId: args.externalId,
      category: "systems",
      title: args.title,
      subtitle: args.subtitle,
      url: args.url,
      // An alarm, not a high priority — see lib/priority.ts.
      priority: ALARM_PRIORITY,
      occurredAt: args.occurredAt,
    },
  });
}

/**
 * One row per certificate about to expire, and none for the rest.
 *
 * **The only thing this collector reports while everything is up.** A service
 * with nine days of certificate left is answering perfectly and is about to
 * stop, and nothing else in Steward would have said so — which is the whole
 * argument for the queue.
 *
 * The same delete-on-recovery shape as the down rows, and for the same reason:
 * a certificate expiring is not "gone, true and final", so rule 3 will not let
 * a dismissal be what clears it. Renew it and the row goes on the next poll.
 *
 * Not rolled up. Certificates do not expire together the way a rebooted host's
 * services go down together, and if two ever did, two rows is the honest count.
 *
 * Returns how many are expiring, for the run summary.
 */
async function syncCertItems(now: Date): Promise<number> {
  const expiring = await prisma.monitor.findMany({
    where: { seenAt: now, certDays: { not: null, lte: CERT_WARN_DAYS } },
    orderBy: { certDays: "asc" },
  });

  const wanted: string[] = [];

  for (const monitor of expiring) {
    const externalId = `cert:${monitor.name}`;
    wanted.push(externalId);

    const days = monitor.certDays ?? 0;

    await prisma.item.upsert({
      where: { source_externalId: { source: "kuma", externalId } },
      // `priority` in the update as well as the create: the row is written once
      // when a certificate first drops under the threshold and rewritten every
      // minute after, so a rung set only on create would be a rung set at
      // fourteen days and never moved. See lib/priority.ts.
      update: {
        title: certTitle(monitor.name, days),
        subtitle: certSubtitle(days),
        priority: PRIORITY.cert,
      },
      create: {
        source: "kuma",
        externalId,
        category: "systems",
        title: certTitle(monitor.name, days),
        subtitle: certSubtitle(days),
        // The service's own address, unlike a down row's: this one is up, so
        // its URL is exactly where you go to look at the certificate.
        url: monitor.url,
        priority: PRIORITY.cert,
        occurredAt: now,
      },
    });
  }

  await prisma.item.deleteMany({
    where: {
      source: "kuma",
      externalId: wanted.length > 0 ? { startsWith: "cert:", notIn: wanted } : { startsWith: "cert:" },
    },
  });

  return expiring.length;
}

function certTitle(name: string, days: number): string {
  return days <= 0
    ? `${name}'s certificate has expired`
    : `${name}'s certificate expires in ${days} day${days === 1 ? "" : "s"}`;
}

function certSubtitle(days: number): string {
  // Naming the renewal window is what makes this actionable rather than
  // alarming: under fourteen days means automatic renewal has already had two
  // attempts and not taken.
  return days <= 0
    ? "renewal has failed — the service will be refused as insecure"
    : "renewal normally happens at 30 days, so this one has not taken";
}
