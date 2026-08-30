import { ExternalLink } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { clock, duration } from "@/lib/format";
import { readSystems, type MonitorRow, type Systems } from "@/lib/systems";
import type { CollectorState } from "@/lib/collectors";

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
 */
export default async function SystemsPage() {
  await requireAuth();

  const now = new Date();
  const { kuma, ha, collectors } = await readSystems(now);

  return (
    <>
      <header className="flex flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">Systems</h1>
        <p className="text-[13px] text-muted-foreground">{verdict(kuma, ha)}</p>
      </header>

      <Card>
        <CardHeader
          title="Services"
          detail={kuma.stale ? null : `${kuma.up} of ${kuma.monitors.length} up · Uptime Kuma`}
          stale={kuma.stale ? kuma.asOf : undefined}
          now={now}
        />

        {kuma.stale ? (
          <NotKnown>
            Uptime Kuma has not answered
            {kuma.asOf ? ` since ${clock(kuma.asOf)}, ${duration(kuma.asOf, now)} ago` : " at all"}.
            Steward does not know the state of any service right now, so it is not going to guess
            one.
          </NotKnown>
        ) : (
          <ul className="flex flex-col">
            {kuma.monitors.map((m) => (
              <li
                key={m.name}
                className="flex items-center gap-[11px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover"
              >
                <Dot tone={m.status === "up" ? "ok" : m.status === "down" ? "down" : "stale"} />
                <span className="min-w-0 grow truncate text-[14px]">{m.name}</span>
                <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
                  {status(m, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Home Assistant"
          detail={null}
          stale={ha.stale ? ha.asOf : undefined}
          now={now}
        />

        {ha.stale ? (
          <NotKnown>
            The Home Assistant collector has not answered
            {ha.asOf ? ` since ${clock(ha.asOf)}, ${duration(ha.asOf, now)} ago` : " at all"}.
          </NotKnown>
        ) : (
          <div className="flex flex-col gap-[2px]">
            {/*
              "None" here is earned: pending updates are genuinely read on every
              run, so an empty list means Steward asked and the answer was none.
              Contrast with the two rows below.
            */}
            {ha.updates.length === 0 ? (
              <Fact label="Updates" value="none pending" />
            ) : (
              ha.updates.map((u) => (
                <div
                  key={u.id}
                  className="flex items-baseline gap-[11px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover"
                >
                  <span className="min-w-0 grow truncate text-[14px]">{u.title}</span>
                  {u.subtitle ? (
                    <span className="shrink-0 truncate font-mono text-[12px] text-muted-foreground">
                      {u.subtitle}
                    </span>
                  ) : null}
                </div>
              ))
            )}

            <Fact
              label="Unavailable entities"
              value={
                ha.unavailable === null
                  ? "not collected yet"
                  : ha.unavailable.count === 0
                    ? "none"
                    : `${ha.unavailable.count} · ${ha.unavailable.entities.slice(0, 3).join(", ")}${
                        ha.unavailable.count > 3 ? "…" : ""
                      }`
              }
              muted={ha.unavailable === null}
            />

            {/*
              Rule 2, at its sharpest. Both of these are real Home Assistant
              features that Steward cannot reach: persistent_notification.*
              yields no entities over REST and every repairs endpoint 404s, so
              both live behind the WebSocket API that ARCHITECTURE.md rule 6
              rules out. Rendering "none" would be a check that never ran
              wearing the clothes of a check that passed.
            */}
            <Fact label="Notifications" value="not connected — WebSocket only" muted />
            <Fact label="Repairs" value="not connected — WebSocket only" muted />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="WhiteTower" detail={null} now={now} />
        <NotKnown>
          Unraid is not connected. It has no read path yet — the GraphQL API, the HACS integration
          and an MQTT script are the three candidates — so the array, its parity check and its disk
          temperatures are not shown rather than shown as healthy. PRD §7, decision 2.
        </NotKnown>
      </Card>

      <Card>
        <CardHeader title="Collectors" detail={`${collectors.length} sources`} now={now} />
        <ul className="flex flex-col">
          {collectors.map((c) => (
            <li
              key={c.source}
              className="flex items-baseline gap-[11px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover"
            >
              <Dot tone={c.stale ? "stale" : "ok"} />
              <span className="shrink-0 text-[14px]">{c.label}</span>
              <span className="min-w-0 grow truncate text-[12px] text-muted-foreground">
                {c.lastError ? c.lastError : `every ${every(c.intervalSeconds)}`}
              </span>
              <span
                className={`shrink-0 font-mono text-[11px] ${c.stale ? "text-warning" : "text-faint"}`}
              >
                {freshness(c, now)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Open />
    </>
  );
}

/* ---------------------------------------------------------------- helpers */

function verdict(kuma: Systems["kuma"], ha: Systems["ha"]): string {
  if (kuma.stale || ha.stale) return "a collector is behind, so some of this is not known";
  if (kuma.down > 0) {
    return `${kuma.down} service${kuma.down === 1 ? " is" : "s are"} down`;
  }
  if (ha.updates.length > 0) {
    return `everything up, ${ha.updates.length} update${ha.updates.length === 1 ? "" : "s"} waiting`;
  }
  return "everything green, nothing to do";
}

/**
 * Down says how long. Up says only "up".
 *
 * `changedAt` is when Steward *observed* a transition, and on a monitor Steward
 * has only ever seen up, that is simply when it first looked — so "up for 31
 * days" would be a number Steward does not have. `/metrics` carries no incident
 * history, and this is where that cost lands. The mockup drew uptime durations;
 * they cannot be honest, so they are not drawn.
 */
function status(m: MonitorRow, now: Date): string {
  if (m.status === "down") return `down for ${duration(m.changedAt, now)}`;
  if (m.status === "up") return "up";
  return m.status;
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[12px] rounded-[10px] border bg-card px-[18px] py-[17px]">
      {children}
    </section>
  );
}

/** `stale` carries the panel's own last-success time, and only when it is old. */
function CardHeader({
  title,
  detail,
  stale,
  now,
}: {
  title: string;
  detail: string | null;
  stale?: Date | null;
  now: Date;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {stale !== undefined ? (
        <span className="font-mono text-[11px] text-warning">
          {stale ? `as of ${clock(stale)}, ${duration(stale, now)} ago` : "never"}
        </span>
      ) : detail ? (
        <span className="font-mono text-[11px] text-faint">{detail}</span>
      ) : null}
    </div>
  );
}

/** Used wherever Steward has no answer, so the shape of "no answer" is consistent. */
function NotKnown({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-[1.6] text-muted-foreground">{children}</p>;
}

function Fact({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-[11px] rounded-[8px] px-[10px] py-[8px]">
      <span className="grow text-[14px]">{label}</span>
      <span className={`font-mono text-[12px] ${muted ? "text-faint" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Where the real apps are. Only the two Steward already has an address for —
 * inventing a third would mean a config entry for a link, and the launcher owns
 * that job from step 13.
 */
function Open() {
  const links = [
    { label: "Uptime Kuma", href: process.env.KUMA_BASE_URL },
    { label: "Home Assistant", href: process.env.HA_BASE_URL },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-[8px]">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-[7px] rounded-[9px] border bg-card px-[13px] py-[9px] text-[13px] transition-colors hover:bg-card-hover"
        >
          Open {l.label}
          <ExternalLink size={13} strokeWidth={1.8} className="text-faint" />
        </a>
      ))}
    </div>
  );
}

const TONE = {
  ok: "var(--teal)",
  down: "var(--destructive)",
  stale: "var(--warning)",
} as const;

function Dot({ tone }: { tone: keyof typeof TONE }) {
  return <span className="size-[7px] shrink-0 rounded-full" style={{ background: TONE[tone] }} />;
}
