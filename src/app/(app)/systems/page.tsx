import { TriangleAlert } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { Dot, type Tone } from "@/components/shell/dot";
import { clock, duration } from "@/lib/format";
import { Tile } from "@/components/shell/tile";
import { readSystems, type ServiceRow, type Systems } from "@/lib/systems";
import { CERT_WARN_DAYS, serviceCaption } from "@/lib/service";
import type { CollectorState } from "@/lib/collectors";
import type { ParityFact } from "@/lib/adapters/unraid";
import type { HardwareFact } from "@/lib/adapters/server";

/** Vincent's timezone, for the one date this page renders. */
const TZ = "America/Toronto";

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
  const { kuma, ha, unraid, server, collectors } = await readSystems(now);

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
            {kuma.monitors.map((m) => {
              const tone = serviceTone(m);
              return (
                <Tile
                  key={m.name}
                  tone={tone}
                  name={m.name}
                  caption={caption(m, now)}
                  alarming={m.status === "down"}
                  // The service's own address, collected on every poll since the
                  // first day and rendered nowhere until now. Null for a monitor
                  // Kuma has none for, and the tile stays inert in that case
                  // rather than becoming a link to nothing.
                  href={m.url}
                  // The ground agrees with the dot. A down service used to be a
                  // red dot over a gold caption on an ordinary card — three
                  // different opinions about one fact.
                  tint={tone !== "ok"}
                  title={serviceDetail(m)}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/*
        The artboard drew this band half and half, WhiteTower beside Home
        Assistant. It is thirds now, with the machine ahead of its own array:
        WhiteTower's card is the disks, and nothing reported the box they are
        in. Vincent's order.
      */}
      <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-3">
        <Section
          title="Server"
          detail={server.configured ? "WhiteTower" : "not connected"}
          stale={server.configured && server.stale ? server.asOf : undefined}
          now={now}
        >
          <Panel>
            <ServerCard server={server} />
          </Panel>
        </Section>

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
                        ? "none"
                        : ha.updates.system.map((u) => `${u.name} ${u.version}`.trim()).join(", ")
                  }
                  muted={ha.updates === null}
                  attention={(ha.updates?.system.length ?? 0) > 0}
                />
                <Fact
                  label="Add-on updates"
                  value={waiting(ha.updates?.addon)}
                  muted={ha.updates === null}
                  attention={(ha.updates?.addon ?? 0) > 0}
                />
                <Fact
                  label="HACS updates"
                  value={waiting(ha.updates?.hacs)}
                  muted={ha.updates === null}
                  attention={(ha.updates?.hacs ?? 0) > 0}
                />
                <Fact
                  label="Device firmware"
                  value={waiting(ha.updates?.firmware)}
                  muted={ha.updates === null}
                  attention={(ha.updates?.firmware ?? 0) > 0}
                />

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
                  detail={unavailableDetail(ha.unavailable)}
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
        {/*
          Services' ladder up to `lg`, then **seven across — one per collector**.

          The two grids diverge on purpose at the top end, which is the opposite
          of the accident they used to be. Services counts whatever is in Uptime
          Kuma and must stay responsive to a number Vincent changes elsewhere;
          the collectors are the adapter list, fixed in code, and a grid that
          fits them exactly leaves no orphan on a second row.

          **Adding an eighth collector means changing this number.** That is the
          price of the exact fit, and it is cheaper than an orphan.
        */}
        {/* Eight since Gmail joined on 2026-09-01, and the number is hardcoded
            on purpose: the collectors are the adapter list, fixed in code, so a
            grid that fits them exactly leaves no orphan on a second row. Moved
            to `2xl` with the eighth — eight at `xl` is 115px a column once the
            rail is taken off, which truncates the labels. */}
        <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
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

/** The names behind the count, honest about being truncated. */
function unavailableDetail(u: Systems["ha"]["unavailable"]): string | undefined {
  if (!u || u.count === 0) return undefined;

  // The adapter stores at most 20 names against a count that is the true total,
  // so the list could quietly disagree with the number it explains. Saying how
  // many of how many is the convention the News page already uses.
  const shown = u.entities.length < u.count ? ` (${u.entities.length} of ${u.count} shown)` : "";

  const ignored =
    u.ignored > 0
      ? `\n\n${u.ignored} media players, remotes and phones ignored — they are unavailable by design`
      : "";

  return `${u.entities.join(", ")}${shown}${ignored}`;
}

/** Undefined is "not collected", which is not the same as zero. */
function waiting(count: number | undefined): string {
  if (count === undefined) return "not collected yet";
  return count === 0 ? "none" : `${count} waiting`;
}

/**
 * The tile's second line. The ladder itself is in `lib/service.ts`, where it can
 * be tested; this only supplies the wording of the duration.
 *
 * **The uptime figure the mockup drew is finally here**, and it is Steward's own
 * rather than Kuma's — see `MonitorOutage`. It names the window it actually
 * watched, because `watchedSince` is the truth about how much this page knows
 * and a confident "30 days" over six hours of observation would be the failure
 * rule 2 exists for.
 */
function caption(m: ServiceRow, now: Date): string {
  return serviceCaption({
    status: m.status,
    responseMs: m.responseMs,
    certDays: m.certDays,
    changedFor: duration(m.changedAt, now),
    stats: m.stats,
  });
}

/**
 * The dot's colour, and now the card's ground too.
 *
 * A certificate about to expire makes a service amber even though it is up and
 * answering: it is going to break on a known date, which is a different claim
 * from "fine" and the card should not look like the ones that are.
 */
function serviceTone(m: ServiceRow): Tone {
  if (m.status === "down") return "down";
  if (m.status === "maintenance") return "maintenance";
  if (m.status === "pending") return "pending";
  if (m.certDays !== null && m.certDays <= CERT_WARN_DAYS) return "degraded";
  return "ok";
}

/**
 * The hover, for what does not earn a place on the face of the card.
 *
 * The check type and the address are worth having and are not worth a chip
 * each: `http` versus `port` is not something acted on daily, and twenty cards
 * carrying one would be twenty pieces of furniture saying nothing.
 */
function serviceDetail(m: ServiceRow): string {
  const parts = [m.type ?? "check", m.url ?? "no address"];
  if (m.certDays !== null) parts.push(`certificate ${m.certDays} days`);
  return parts.join(" · ");
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
 * The machine, from two sources that fail independently.
 *
 * `/proc` says what the OS is doing and the BMC says what the hardware is
 * doing, and neither can answer for the other — so the BMC being unreachable
 * costs the last two lines and nothing else. That is the point of recording its
 * failure inside the fact rather than throwing: the card gets to say "up 14
 * days" and "the BMC is not answering" in the same breath, which is true, where
 * an amber card would only have said the second.
 */
function ServerCard({ server }: { server: Systems["server"] }) {
  if (!server.configured) {
    return (
      <NotKnown>
        Not connected. Steward reads this machine&rsquo;s own state, and needs{" "}
        <span className="font-mono text-[13px]">HOST_PROC_DIR</span> set to do it — until then its
        uptime, load and memory are absent here rather than shown as healthy.
      </NotKnown>
    );
  }

  const { vitals, hardware } = server;
  if (!vitals) return <NotKnown>Not read yet. The first check runs within five minutes.</NotKnown>;

  return (
    <div className={`flex flex-col ${server.stale ? "opacity-45" : ""}`}>
      <Fact
        label="Uptime"
        value={upFor(vitals.uptimeSeconds)}
        // "336 hours" is the same fact needing arithmetic. When it last came up
        // is the thing anyone actually wants from an uptime.
        detail={`Booted ${bootedAt(vitals.uptimeSeconds)}`}
      />

      <Fact
        label="Load"
        value={vitals.load.map((n) => n.toFixed(2)).join("  ")}
        detail="One, five and fifteen minute averages"
      />

      <Gauge
        label="Memory"
        value={`${gb(vitals.memUsedBytes)} of ${gb(vitals.memTotalBytes)}`}
        fraction={vitals.memTotalBytes > 0 ? vitals.memUsedBytes / vitals.memTotalBytes : 0}
        detail="What a new process could not have. Page cache does not count as used."
      />

      {/*
        A hardware fact that has never been written reads as **not read yet**,
        never as three lines saying "none reported". The BMC answering and
        finding nothing is a different claim from nobody having asked, and
        collapsing them is the exact failure rule 2 exists for.
      */}
      {!hardware || hardware.unreachable ? (
        // Named, not hidden. The uptime above it is still true.
        <Fact label="Hardware" value={hardware?.unreachable ?? "not read yet"} muted />
      ) : (
        <>
          <Fact
            label="Health"
            value={hardware.health?.toLowerCase() ?? "not reported"}
            muted={!hardware.health}
            attention={hardware.health !== null && hardware.health !== "OK"}
          />
          <Fact
            label="Warmest sensor"
            value={
              hardware.hottest
                ? `${hardware.hottest.name} · ${hardware.hottest.celsius}°C`
                : "none reported"
            }
            muted={!hardware.hottest}
          />
          <Fact
            label="Fans"
            value={fansLine(hardware)}
            muted={hardware.fans.total === 0}
            attention={hardware.fans.faulty.length > 0}
          />
        </>
      )}
    </div>
  );
}

/** The moment it last came up, in the house's timezone. */
function bootedAt(uptimeSeconds: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(Date.now() - uptimeSeconds * 1000));
}

/** "up 14 days", "up 6 hours", "up 41 minutes" — never a raw second count. */
function upFor(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `up ${days} ${days === 1 ? "day" : "days"}`;

  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `up ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `up ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function fansLine(hardware: HardwareFact): string {
  if (hardware.fans.total === 0) return "none reported";
  if (hardware.fans.faulty.length === 0) return `${hardware.fans.total} spinning`;
  return `${hardware.fans.faulty.join(", ")} not OK`;
}

/** Gibibytes, one decimal — how a person reads memory, unlike disks. */
function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
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
        <span className="font-mono text-[13px]">UNRAID_STATE_DIR</span> set to do it — until then
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
      {/*
        A band, not a red sentence.
        It shipped as `text-destructive` on an ordinary paragraph and read as
        subtle — which for the one fact on this page that changes what you do
        today is the wrong volume. Red text among black text is a colour; a
        tinted band with a rule down its edge is an alarm.
      */}
      {array.disabled.length > 0 ? (
        <div className="mb-[12px] flex items-start gap-[10px] rounded-[8px] border-l-[3px] border-destructive bg-[color-mix(in_srgb,var(--destructive)_9%,transparent)] px-[12px] py-[10px]">
          <TriangleAlert
            size={16}
            strokeWidth={2}
            className="mt-[2px] shrink-0 text-destructive"
          />
          <div className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-[15px] font-semibold text-destructive">
              {list(array.disabled)} {array.disabled.length === 1 ? "is" : "are"} disabled
            </span>
            <span className="text-[13px] leading-[1.5] text-muted-foreground">
              Unraid is emulating the contents from parity. The array is readable and has no
              redundancy to spare for {array.disabled.length === 1 ? "that disk" : "those disks"}.
            </span>
          </div>
        </div>
      ) : null}

      {/* `!== null`, not truthiness: a genuinely empty array uses 0 bytes, and
          that is a figure rather than a missing one. */}
      {array.sizeBytes !== null && array.usedBytes !== null && array.sizeBytes > 0 ? (
        <Gauge
          label="Array"
          value={`${tb(array.usedBytes)} of ${tb(array.sizeBytes)}`}
          fraction={array.usedBytes / array.sizeBytes}
          detail={`${data.length} data ${data.length === 1 ? "disk" : "disks"}, array ${array.state.toLowerCase()}`}
        />
      ) : (
        <Fact label="Array" value={array.state.toLowerCase() || "unknown"} muted />
      )}

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

  if (p.status === "running") return `${what} in progress · ${p.percent ?? 0}% · ${errs}`;
  if (p.status === "paused") return `${what} paused at ${p.percent ?? 0}% · ${errs}`;

  // Idle. `sbSynced2` is when the last operation last wrote, which is when it
  // stopped — so this says **when it ran**, never that it completed. Nothing
  // here can tell a finished run from a reset one, and the file that could is
  // unreadable to Steward.
  if (!p.action) return "never run";
  const when = p.updatedAt ? ranOn(p.updatedAt) : null;
  return when ? `${what} · last ran ${when} · ${errs}` : `${what} · ${errs}`;
}

/** Unraid's own words for what the array is doing, in Steward's. */
const ACTION: Record<string, string> = {
  "check P": "Parity check",
  "check P Q": "Parity check",
  "recon P": "Rebuilding",
  "recon P Q": "Rebuilding",
  clear: "Clearing",
};

/** Unix seconds as Unraid writes them, to a date someone can read. */
function ranOn(unixSeconds: string): string | null {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  }).format(new Date(seconds * 1000));
}

/**
 * A fact with a bar under it.
 *
 * The only measure on the page with a natural ceiling, which is exactly what a
 * bar is for: "16.4 TB of 46.3 TB" needs arithmetic to feel, and a bar does not.
 * Nothing else here gets one — a temperature has no full.
 *
 * The bar is `muted-foreground`, not gold: it is a quantity, not a status, and
 * colour in Steward only ever carries meaning.
 */
function Gauge({
  label,
  value,
  fraction,
  detail,
}: {
  label: string;
  value: string;
  fraction: number;
  detail?: string;
}) {
  const percent = Math.min(100, Math.max(0, Math.round(fraction * 100)));

  return (
    <div className="flex flex-col gap-[6px] py-[6px]" title={detail}>
      <div className="flex items-baseline gap-[10px]">
        {/* The same 7px the dot occupies in `Fact`, so a gauge sitting among
            facts keeps its label on their line rather than 15px to the left. */}
        <span aria-hidden className="size-[7px] shrink-0" />
        <span className={`grow text-[15px] ${detail ? "cursor-help" : ""}`}>{label}</span>
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
          {value} · {percent}%
        </span>
      </div>
      <div
        className="h-[5px] w-full overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`${label}: ${value}, ${percent} percent used`}
      >
        <div
          className="h-full rounded-full bg-muted-foreground"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Terabytes, one decimal. Unraid counts in 1024-byte blocks; people do not. */
function tb(bytes: number): string {
  return `${(bytes / 1e12).toFixed(1)} TB`;
}

function list(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

/**
 * Used wherever Steward has no answer, so the shape of "no answer" is
 * consistent — and **capped at a readable measure**, which nothing outside
 * `EmptyState` was until 2026-09-01. `main` has no max-width, so a 28-word
 * sentence rendered as a single 1648px line of about 250 characters.
 */
function NotKnown({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[62ch] text-[14px] leading-[1.6] text-muted-foreground">{children}</p>;
}

/**
 * A labelled line, and whether it wants you.
 *
 * **`attention` is the whole reason this component changed.** "42 waiting" and
 * "none" sat in the same position in the same muted grey, so the card had to be
 * read rather than glanced at — which is the one thing a systems card exists to
 * avoid. A row that wants something carries an amber dot and its value at full
 * weight; every other row keeps the dot's width so the labels stay aligned.
 *
 * `pending` is the tone deliberately: it is already the app's word for waiting,
 * and an update is not a fault. Red would cry wolf and green would be a lie.
 */
function Fact({
  label,
  value,
  muted,
  attention,
  detail,
}: {
  label: string;
  value: string;
  muted?: boolean;
  attention?: boolean;
  /** Shown on hover, for a number that needs its working shown. */
  detail?: string;
}) {
  return (
    <div className="flex items-baseline gap-[10px] py-[6px]" title={detail}>
      <span className="flex min-w-0 grow items-baseline gap-[8px]">
        {attention ? (
          <Dot tone="pending" className="translate-y-[-1px]" />
        ) : (
          <span aria-hidden className="size-[7px] shrink-0" />
        )}
        <span className={`min-w-0 text-[15px] ${detail ? "cursor-help" : ""}`}>{label}</span>
      </span>
      <span
        className={`shrink-0 font-mono text-[13px] ${
          attention ? "text-foreground" : muted ? "text-faint" : "text-muted-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

