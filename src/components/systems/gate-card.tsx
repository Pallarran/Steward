import { clock, duration } from "@/lib/format";
import { readGate } from "@/lib/systems";
import { Dot, type Tone } from "@/components/shell/dot";
import { Panel } from "@/components/shell/panel";

/**
 * The gate. Knowing the homelab is fine is what frees Vincent to move down the
 * list, so this is the one panel that is allowed to be reassuring — and only
 * when it has grounds to be.
 *
 * Green when clear. When it is not clear it becomes a column: a heading, then
 * one line per problem. **Down and stale are said differently on purpose** —
 * down is red and names the service, stale is amber and blames the collector
 * rather than the system.
 */
export async function GateCard() {
  const now = new Date();
  const gate = await readGate(now);

  if (gate.state === "clear") {
    return (
      <Panel as="section" pad="lg" className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Dot tone="ok" size={9} ring />
          <span className="text-[16px] font-semibold">All clear</span>
          <span className="text-[13px] text-muted-foreground">
            {gate.monitorsUp} of {gate.monitorsTotal} monitors up, nothing needs you
          </span>
        </div>
      </Panel>
    );
  }

  const heading =
    gate.problems.length === 1 ? "One thing to know" : `${gate.problems.length} things to know`;

  return (
    <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Dot tone={gate.stale ? "stale" : "down"} size={9} ring />
          <span className="text-[16px] font-semibold">{heading}</span>
        </div>
        {gate.stale ? <AsOf at={gate.asOf} now={now} /> : null}
      </div>

      <div className="flex flex-col gap-[8px] pl-[20px]">
        {gate.problems.map((p) =>
          p.kind === "down" ? (
            <div key={`down:${p.name}`} className="flex items-baseline gap-[10px]">
              <Bullet tone="down" />
              <span className="text-[14px]">
                {p.name} has been down for {duration(p.since, now)}
              </span>
              <span className="font-mono text-[12px] text-muted-foreground">
                {gate.monitorsUp}/{gate.monitorsTotal} monitors up
              </span>
            </div>
          ) : (
            <div key={`stale:${p.collector}`} className="flex items-baseline gap-[10px]">
              <Bullet tone="stale" />
              <span className="text-[14px]">
                {p.lastSuccessAt
                  ? `${p.collector} has not answered since ${clock(p.lastSuccessAt)}`
                  : `${p.collector} has never answered`}
              </span>
              <span className="font-mono text-[12px] text-muted-foreground">
                {p.lastSuccessAt
                  ? `stale for ${duration(p.lastSuccessAt, now)}: the collector is failing`
                  : "the collector has not run"}
              </span>
            </div>
          ),
        )}
      </div>
    </Panel>
  );
}

/**
 * The gate's dot is the largest in the app and the only one with a halo — it is
 * the single thing on the page that answers "is the house fine".
 */
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
    <span className="font-mono text-[11px] text-warning">
      {at ? `as of ${clock(at)}, ${duration(at, now)} ago` : "never"}
    </span>
  );
}
