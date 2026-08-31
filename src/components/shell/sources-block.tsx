import { readCollectors } from "@/lib/collectors";
import { clock, duration } from "@/lib/format";

/**
 * The collectors' clock, pinned under the level block.
 *
 * Two jobs. It is the always-ticking proof that anything is running at all —
 * which is how auto-refresh gets verified without staring at a static page —
 * and it is where you glance to ask "is anything behind?" without reading
 * every panel.
 *
 * Panels no longer carry a stamp while they are fresh; they speak up in amber
 * when their own source is stale. Rule 2 still holds, and more sharply: on a
 * normal day this line is the only timestamp on screen, and on a bad day the
 * affected panel says so where the wrong data actually is.
 */
export async function SourcesBlock() {
  const now = new Date();
  const { all, stale, oldest } = await readCollectors(now);

  // Before any collector has ever run there is nothing to date, and saying
  // "as of never" would be louder than the situation warrants.
  if (all.length === 0) return null;

  if (stale.length > 0) {
    return (
      <div className="flex flex-col gap-[2px] px-[16px] font-mono text-[11px] text-warning">
        {stale.map((c) => (
          <span key={c.source}>
            {c.label} {c.asOf ? `${duration(c.asOf, now)} behind` : "has never answered"}
          </span>
        ))}
      </div>
    );
  }

  return (
    <span className="px-[16px] font-mono text-[11px] text-faint">
      {all.length} sources · as of {oldest ? clock(oldest) : "—"}
    </span>
  );
}
