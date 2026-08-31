import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { Dot, type Tone } from "@/components/shell/dot";
import { clock, duration } from "@/lib/format";
import { readSystems, type MonitorRow, type Systems } from "@/lib/systems";
import type { CollectorState } from "@/lib/collectors";
import type { ParityFact } from "@/lib/adapters/unraid";

export const metadata = { title: "Systems · Steward" };

/**
 * The Systems page.
 *
 * The gate card on Home shows only *problems*, by design — which means that on
 * a green day there is nowhere in Steward to see which services are actually
 * up, and checking that is exactly what Uptime Kuma gets opened for. This is
 * the page that makes the tour shrink for systems. PRD §3.4 item 2.
 *
 * Everything here is read from the database, never from a source directly:
 * `docs/ARCHITECTURE.md` rule 1. A dead source cannot break this page; it can
 * only turn its own section amber.
 *
 * Layout follows the `TabSystems` artboard: a full-width grid of service
 * tiles, then a half-and-half row, then the collectors. Each section names its
 * source in its own heading, and that name is the way out to the real app —
 * there is no separate row of links at the bottom.
 */
export default async function SystemsPage() {
  await requireAuth();

  const now = new Date();
  const { kuma, ha, unraid, collectors } = await readSystems(now);

  return (
    <>
      <PageHeader title="Systems" subtitle={verdict(kuma, ha, unraid)} />

      <Section
        title="Services"
        detail={kuma.stale ? "Uptime Kuma" : `${kuma.up} of ${kuma.monitors.length} up · Uptime Kuma`}
        href={process.env.KUMA_BASE_URL}
        stale={kuma.stale ? kuma.asOf : undefined}
        now={now}
      >
        {kuma.stale ? (
          <NotKnown>
            Uptime Kuma has not answered
            {kuma.asOf ? ` since ${clock(kuma.asOf)}, ${duration(kuma.asOf, now)} ago` : " at all"}.
            Steward does not know the state of any service right now, so it is not going to guess
            one.
          </NotKnown>
        ) : (
          <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {kuma.monitors.map((m) => (
              <Tile
                key={m.name}
                tone={m.status === "up" ? "ok" : m.status === "down" ? "down" : "stale"}
                name={m.name}
                caption={caption(m, now)}
                alarming={m.status === "down"}
              />
            ))}
          </div>
        )}
      </Section>

      {/* The artboard's second band, half and half. */}
      <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-2">
        <Section
          title="WhiteTower"
          detail={unraid.configured ? "Unraid" : "Unraid · not connected"}
          stale={unraid.configured && unraid.stale ? unraid.asOf : undefined}
          now={now}
        >
          <Panel>
            <WhiteTower unraid={unraid} />
          </Panel>
        </Section>

        <Section
          title="Home Assistant"
          detail="open"
          href={process.env.HA_BASE_URL}
          stale={ha.stale ? ha.asOf : undefined}
          now={now}
        >
          <Panel>
            {ha.stale ? (
              <NotKnown>
                The Home Assistant collector has not answered
                {ha.asOf ? ` since ${clock(ha.asOf)}, ${duration(ha.asOf, now)} ago` : " at all"}.
              </NotKnown>
            ) : (
              <div className="flex flex-col gap-[2px]">
                {/*
                  Four rows where the artboard drew three, because the live
                  instance has four kinds and folding the fourth into HACS
                  would label six device firmwares as frontend cards. The split
                  is decided by attributes in the adapter: 3 system, 7 add-ons,
                  42 HACS, 6 firmware, of 58 update entities.

                  "None" here is earned — every update entity is read on every
                  run, so nothing pending means Steward asked and the answer was
                  none. Contrast with the two rows at the bottom.
                */}
                <Fact
                  label="Core, OS and Supervisor"
                  value={
                    ha.updates === null
                      ? "not collected yet"
                      : ha.updates.system.length === 0
                        ? "none pending"
                        : ha.updates.system.map((u) => `${u.name} ${u.version}`.trim()).join(", ")
                  }
                  muted={ha.updates === null}
                />
                <Fact label="Add-on updates" value={waiting(ha.updates?.addon)} />
                <Fact label="HACS updates" value={waiting(ha.updates?.hacs)} />
                <Fact label="Device firmware" value={waiting(ha.updates?.firmware)} />

                <Fact
                  label="Unavailable entities"
                  value={
                    ha.unavailable === null
                      ? "not collected yet"
                      : ha.unavailable.count === 0
                        ? "none"
                        : String(ha.unavailable.count)
                  }
                  muted={ha.unavailable === null}
                  // The names, so the number can be acted on rather than only
                  // read. The ignored count is here too, because a filtered
                  // number that does not say what it filtered is a number you
                  // have to take on trust.
                  detail={
                    ha.unavailable && ha.unavailable.count > 0
                      ? `${ha.unavailable.entities.join(", ")}${
                          ha.unavailable.ignored > 0
                            ? `\n\n${ha.unavailable.ignored} media players, remotes and phones ignored — they are unavailable by design`
                            : ""
                        }`
                      : undefined
                  }
                />

                {/*
                  Rule 2, at its sharpest. Both of these are real Home Assistant
                  features Steward cannot reach: persistent_notification.* yields
                  no entities over REST and every repairs endpoint 404s, so both
                  live behind the WebSocket API that ARCHITECTURE.md rule 6 rules
                  out. Rendering "none" would be a check that never ran wearing
                  the clothes of a check that passed.
                */}
                <Fact label="Notifications" value="not checked" muted />
                <Fact label="Repairs" value="not checked" muted />
              </div>
            )}
          </Panel>
        </Section>
      </div>

      <Section title="Collectors" detail={`${collectors.length} sources`} now={now}>
        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2 xl:grid-cols-3">
          {collectors.map((c) => (
            <Tile
              key={c.source}
              tone={c.stale ? "stale" : "ok"}
              name={c.label}
              caption={
                c.lastError
                  ? c.lastError
                  : `every ${every(c.intervalSeconds)} · ${freshness(c, now)}`
              }
              alarming={c.stale || c.lastError !== null}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- helpers */

function verdict(
  kuma: Systems["kuma"],
  ha: Systems["ha"],
  unraid: Systems["unraid"],
): string {
  if (kuma.stale || ha.stale) return "a collector is behind, so some of this is not known";

  // Ahead of a service being down: a service recovers on its own, an array
  // running on emulated data does not.
  const disabled = unraid.array?.disabled ?? [];
  if (!unraid.stale && disabled.length > 0) {
    return `${disabled.join(" and ")} disabled on WhiteTower`;
  }

  if (kuma.down > 0) {
    return `${kuma.down} service${kuma.down === 1 ? " is" : "s are"} down`;
  }

  const u = ha.updates;
  const pending = u ? u.system.length + u.addon + u.hacs + u.firmware : 0;
  if (pending > 0) {
    return `everything up, ${pending} update${pending === 1 ? "" : "s"} waiting`;
  }

  return "everything green, nothing to do";
}

/** Undefined is "not collected", which is not the same as zero. */
function waiting(count: number | undefined): string {
  if (count === undefined) return "not collected yet";
  return count === 0 ? "none" : `${count} waiting`;
}

/**
 * The tile's second line.
 *
 * Down says how long. Up says its response time, which `/metrics` genuinely
 * supplies — unlike the uptime duration the mockup drew, which it does not.
 * `changedAt` is only ever *when Steward watched it change*, so on a monitor
 * that has always been up it is when Steward first looked, and "up for 31 days"
 * would be a number Steward does not have.
 *
 * A monitor with no response time gets an empty line rather than a zero.
 */
function caption(m: MonitorRow, now: Date): string {
  if (m.status === "down") return `down for ${duration(m.changedAt, now)}`;
  if (m.responseMs !== null) return `${m.responseMs} ms`;
  return m.status === "up" ? "up" : m.status;
}

function every(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function freshness(c: CollectorState, now: Date): string {
  if (c.asOf === null) return "never run";
  if (c.stale) return `${duration(c.asOf, now)} behind`;
  return clock(c.asOf);
}

/** The bordered body of a section that is a list of facts rather than tiles. */

/**
 * One tile — the artboard's unit for both services and collectors. It carries
 * its border all the time rather than on hover: a grid of things that only
 * become visible when the pointer is over them is a grid you have to sweep.
 */
function Tile({
  tone,
  name,
  caption,
  alarming,
}: {
  tone: Tone;
  name: string;
  caption: string;
  alarming: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[6px] rounded-[9px] border bg-card px-[12px] py-[10px] transition-colors">
      <div className="flex items-center gap-[8px]">
        <Dot tone={tone} />
        <span className="min-w-0 truncate text-[13px]">{name}</span>
      </div>
      <span
        className={`truncate font-mono text-[11px] ${alarming ? "text-warning" : "text-faint"}`}
        title={caption}
      >
        {caption}
      </span>
    </div>
  );
}

/**
 * The array, its disks and whatever parity is doing.
 *
 * Three states, and the difference between them is the whole point: not
 * connected, connected but the collector is behind, and connected and current.
 * Only the third shows numbers.
 */
function WhiteTower({ unraid }: { unraid: Systems["unraid"] }) {
  if (!unraid.configured) {
    return (
      <NotKnown>
        Not connected. Steward reads Unraid&rsquo;s own state from this machine, and needs{" "}
        <span className="font-mono text-[12px]">UNRAID_STATE_DIR</span> set to do it — until then
        the array&rsquo;s usage, its parity and its disk temperatures are absent here rather than
        shown as healthy.
      </NotKnown>
    );
  }

  const { array, parity } = unraid;
  if (!array) return <NotKnown>Not read yet. The first check runs within two minutes.</NotKnown>;

  const data = array.disks.filter((d) => d.role === "Data");

  // Every disk with errors, disabled ones included. The first version excluded
  // them to avoid repeating the banner, which meant a disabled disk carrying
  // 128 errors rendered this line as "none" — a true sentence about the wrong
  // set, read as a false one about the whole array.
  const erroring = array.disks.filter((d) => d.errors > 0);

  return (
    <div className={`flex flex-col ${unraid.stale ? "opacity-45" : ""}`}>
      {/* Ahead of every number, because a disk being emulated from parity is
          the fact that changes what you do today. */}
      {array.disabled.length > 0 ? (
        <p className="pb-[8px] text-[13px] leading-[1.6] text-destructive">
          {list(array.disabled)} {array.disabled.length === 1 ? "is disabled" : "are disabled"} —
          contents emulated from parity.
        </p>
      ) : null}

      <Fact
        label="Array"
        value={
          // `!== null`, not truthiness: a genuinely empty array uses 0 bytes,
          // and that is a figure rather than a missing one.
          array.sizeBytes !== null && array.usedBytes !== null && array.sizeBytes > 0
            ? `${tb(array.usedBytes)} of ${tb(array.sizeBytes)} · ${Math.round(
                (array.usedBytes / array.sizeBytes) * 100,
              )}%`
            : array.state.toLowerCase() || "unknown"
        }
        detail={`${data.length} data ${data.length === 1 ? "disk" : "disks"}, array ${array.state.toLowerCase()}`}
      />

      <Fact label="Parity" value={parity ? parityLine(parity) : "not read yet"} />

      <Fact
        label="Warmest disk"
        value={array.hottest ? `${array.hottest.name} · ${array.hottest.tempC}°C` : "all spun down"}
        muted={!array.hottest}
        detail={array.disks
          .map((d) => `${d.name}: ${d.tempC === null ? "spun down" : `${d.tempC}°C`}`)
          .join(", ")}
      />

      <Fact
        label="Read/write errors"
        value={
          erroring.length === 0
            ? "none"
            : erroring.map((d) => `${d.name} ${d.errors}`).join(", ")
        }
        muted={erroring.length === 0}
      />
    </div>
  );
}

/**
 * What parity is doing, in one line.
 *
 * **The percentage always travels with the error count.** Zero errors on a
 * check that has covered half the array is not a clean array, and the two
 * numbers apart would read as one — which is rule 2's failure in miniature.
 *
 * "Paused" is as far as this goes on a stopped check. The Parity Check Tuning
 * plugin stands down for temperature and resumes by itself, and an abandoned
 * check leaves the same fields behind, so Steward reports the position and
 * declines to say which happened. The history that would settle it lives in a
 * file it cannot read — see `src/lib/adapters/unraid.ts`.
 */
function parityLine(p: ParityFact): string {
  const what = ACTION[p.action ?? ""] ?? p.action ?? "operation";
  const errs = `${p.errors} ${p.errors === 1 ? "error" : "errors"}`;

  if (p.status === "running") return `${what} · ${p.percent ?? 0}% · ${errs}`;
  if (p.status === "paused") return `${what} paused at ${p.percent ?? 0}% · ${errs}`;
  // Not "finished". Idle means no position is being held, which is consistent
  // with a completed run and with a reset one, and Steward cannot tell them
  // apart from these fields — the file that could is unreadable to it.
  return p.action ? `${what} · ${errs}` : "never run";
}

/** Unraid's own words for what the array is doing, in Steward's. */
const ACTION: Record<string, string> = {
  "check P": "Parity check",
  "check P Q": "Parity check",
  "recon P": "Rebuilding",
  "recon P Q": "Rebuilding",
  clear: "Clearing",
};

/** Terabytes, one decimal. Unraid counts in 1024-byte blocks; people do not. */
function tb(bytes: number): string {
  return `${(bytes / 1e12).toFixed(1)} TB`;
}

function list(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

/** Used wherever Steward has no answer, so the shape of "no answer" is consistent. */
function NotKnown({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-[1.6] text-muted-foreground">{children}</p>;
}

function Fact({
  label,
  value,
  muted,
  detail,
}: {
  label: string;
  value: string;
  muted?: boolean;
  /** Shown on hover, for a number that needs its working shown. */
  detail?: string;
}) {
  return (
    <div className="flex items-baseline gap-[10px] py-[6px]" title={detail}>
      <span className={`grow text-[14px] ${detail ? "cursor-help" : ""}`}>{label}</span>
      <span className={`font-mono text-[12px] ${muted ? "text-faint" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

