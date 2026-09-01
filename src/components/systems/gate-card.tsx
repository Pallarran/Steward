import { clock, duration } from "@/lib/format";
import { readGate } from "@/lib/systems";
import { Dot, type Tone } from "@/components/shell/dot";
import { Panel } from "@/components/shell/panel";

/**
 * The gate. Knowing the homelab is fine is what frees Vincent to move down the
 * list, so this is the one panel that is allowed to be reassuring — and only
 * when it has grounds to be.
 *
 * **It renders nothing when the house is fine**, since 2026-09-01. The stats
 * band above carries `8/8 up` in a 38px tile, so a 60px card saying "All clear,
 * nothing needs you" was the same fact twice and 60px of a page that has to fit
 * a screen. When it is *not* clear it appears exactly as before and is the loud
 * thing on the page — which is the point of it.
 *
 * Rule 2 is untouched: a stale collector is not "clear", so the tile goes amber
 * and this card appears naming which one and for how long. Nothing quietly
 * stops being said.
 *
 * When it is not clear it is a column: a heading, then one line per problem.
 * **Down and stale are said differently on purpose** — down is red and names
 * the service, stale is amber and blames the collector rather than the system.
 */
export async function GateCard() {
  const now = new Date();
  // No argument: `readGate` is `cache`d and a fresh Date would be a fresh key.
  const gate = await readGate();

  if (gate.state === "clear") return null;

  const heading =
    gate.problems.length === 1 ? "One thing to know" : `${gate.problems.length} things to know`;

  return (
    <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          {/* Amber for degraded: everything still reads, and the array is
              running on its spare rather than broken. */}
          <Dot
            tone={gate.stale || gate.state === "degraded" ? "stale" : "down"}
            size={9}
            ring
          />
          <span className="text-[17px] font-semibold">{heading}</span>
        </div>
        {gate.stale ? <AsOf at={gate.asOf} now={now} /> : null}
      </div>

      {/*
        Three kinds of problem, said three different ways on purpose. Down is
        red and names the service. Stale is amber and blames the collector
        rather than the system. Degraded is amber and names what is left —
        because "disk4 is disabled" without "one parity device spare" is a fact
        with no decision attached to it.
      */}
      <div className="flex flex-col gap-[8px] pl-[20px]">
        {gate.problems.map((p) => {
          if (p.kind === "down") {
            return (
              <div key={`down:${p.name}`} className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
                <Bullet tone="down" />
                <span className="min-w-0 text-[15px]">
                  {p.name} has been down for {duration(p.since, now)}
                </span>
                <span className="font-mono text-[13px] text-muted-foreground">
                  {gate.monitorsUp}/{gate.monitorsTotal} monitors up
                </span>
              </div>
            );
          }

          if (p.kind === "degraded") {
            return (
              <div key="degraded" className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
                <Bullet tone={p.spare === 0 ? "down" : "stale"} />
                <span className="min-w-0 text-[15px]">
                  {list(p.disks)} {p.disks.length === 1 ? "is" : "are"} disabled on WhiteTower
                </span>
                <span className="font-mono text-[13px] text-muted-foreground">
                  {p.spare === 0
                    ? "no redundancy left: the next failure loses data"
                    : `emulated from parity, ${p.spare} spare`}
                </span>
              </div>
            );
          }

          return (
            <div key={`stale:${p.collector}`} className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
              <Bullet tone="stale" />
              <span className="min-w-0 text-[15px]">
                {p.lastSuccessAt
                  ? `${p.collector} has not answered since ${clock(p.lastSuccessAt)}`
                  : `${p.collector} has never answered`}
              </span>
              <span className="font-mono text-[13px] text-muted-foreground">
                {p.lastSuccessAt
                  ? `stale for ${duration(p.lastSuccessAt, now)}: the collector is failing`
                  : "the collector has not run"}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/**
 * The gate's dot is the largest in the app and the only one with a halo — it is
 * the single thing on the page that answers "is the house fine".
 */
function list(names: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names);
}

function Bullet({ tone }: { tone: Tone }) {
  return <Dot tone={tone} className="-translate-y-[2px]" />;
}

/**
 * Shown only when this panel's own source is stale. The always-on clock lives
 * under the level block in the rail; here a timestamp means something is
 * wrong, so it is always amber.
 */
function AsOf({ at, now }: { at: Date | null; now: Date }) {
  return (
    <span className="font-mono text-[12px] text-warning">
      {at ? `as of ${clock(at)}, ${duration(at, now)} ago` : "never"}
    </span>
  );
}
