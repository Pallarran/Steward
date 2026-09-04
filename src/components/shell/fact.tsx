import { Dot } from "./dot";

/**
 * A labelled line, and whether it wants you.
 *
 * **`attention` is the whole reason this exists rather than a `<div>`.** "42
 * waiting" and "none" sat in the same position in the same muted grey, so a
 * card had to be read rather than glanced at — which is the one thing a systems
 * card exists to avoid. A row that wants something carries an amber dot and its
 * value at full weight; every other row keeps the dot's width so the labels stay
 * aligned.
 *
 * `pending` is the tone deliberately: it is already the app's word for waiting,
 * and an update is not a fault. Red would cry wolf and green would be a lie.
 *
 * **Extracted from `systems/page.tsx` on 2026-09-04**, where it was local and
 * used twelve times while Finance built the same row by hand.
 */
export function Fact({
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

/**
 * A `Fact` with a bar under it.
 *
 * For a measure with a natural ceiling, which is exactly what a bar is for:
 * "16.4 TB of 46.3 TB" needs arithmetic to feel, and a bar does not. A
 * temperature has no full, so it stays a `Fact`.
 *
 * The bar is `muted-foreground`, not gold: it is a quantity, not a status, and
 * colour in Steward only ever carries meaning.
 */
export function Gauge({
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
        <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
