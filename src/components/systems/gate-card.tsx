import { clock, duration } from "@/lib/format";
import { readGate } from "@/lib/systems";

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
      <section className="flex items-center justify-between rounded-[10px] border bg-card px-[18px] py-[16px]">
        <div className="flex items-center gap-[13px]">
          <Dot tone="ok" />
          <span className="text-[16px] font-semibold">All clear</span>
          <span className="text-[13px] text-muted-foreground">
            {gate.monitorsUp} of {gate.monitorsTotal} monitors up, nothing needs you
          </span>
        </div>
        <AsOf at={gate.asOf} stale={false} now={now} />
      </section>
    );
  }

  const heading =
    gate.problems.length === 1 ? "One thing to know" : `${gate.problems.length} things to know`;

  return (
    <section className="flex flex-col gap-[12px] rounded-[10px] border bg-card px-[18px] py-[16px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[13px]">
          <Dot tone={gate.stale ? "stale" : "down"} />
          <span className="text-[16px] font-semibold">{heading}</span>
        </div>
        <AsOf at={gate.asOf} stale={gate.stale} now={now} />
      </div>

      <div className="flex flex-col gap-[9px] pl-[22px]">
        {gate.problems.map((p) =>
          p.kind === "down" ? (
            <div key={`down:${p.name}`} className="flex items-baseline gap-[11px]">
              <Bullet tone="down" />
              <span className="text-[14px]">
                {p.name} has been down for {duration(p.since, now)}
              </span>
              <span className="font-mono text-[12px] text-muted-foreground">
                {gate.monitorsUp}/{gate.monitorsTotal} monitors up
              </span>
            </div>
          ) : (
            <div key={`stale:${p.collector}`} className="flex items-baseline gap-[11px]">
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
    </section>
  );
}

const TONE = {
  ok: "var(--teal)",
  down: "var(--destructive)",
  stale: "var(--warning)",
} as const;

function Dot({ tone }: { tone: keyof typeof TONE }) {
  return (
    <span
      className="size-[9px] shrink-0 rounded-full"
      style={{ background: TONE[tone], boxShadow: `0 0 0 4px color-mix(in srgb, ${TONE[tone]} 16%, transparent)` }}
    />
  );
}

function Bullet({ tone }: { tone: keyof typeof TONE }) {
  return (
    <span
      className="size-[7px] shrink-0 -translate-y-[2px] rounded-full"
      style={{ background: TONE[tone] }}
    />
  );
}

/** Every panel carries an "as of" time. Amber when what it dates is stale. */
function AsOf({ at, stale, now }: { at: Date | null; stale: boolean; now: Date }) {
  if (!at) {
    return <span className="font-mono text-[11px] text-warning">never</span>;
  }
  return (
    <span className={`font-mono text-[11px] ${stale ? "text-warning" : "text-faint"}`}>
      {stale ? `as of ${clock(at)}, ${duration(at, now)} ago` : `as of ${clock(at)}`}
    </span>
  );
}
