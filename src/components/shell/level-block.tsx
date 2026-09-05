import { Crown } from "lucide-react";
import { Panel } from "./panel";

type Props = {
  /** Both arrive in step 11, derived from Activity. Nothing stores a score. */
  level?: number;
  remaining?: number;
  weekTotal?: number;
};

/**
 * Pinned to the bottom of the rail, once there is something to pin.
 *
 * The bar **drains** as the week is worked, so it agrees with the words beside
 * it — docs/DESIGN.md. It shows what is left, never what has been banked.
 *
 * **It renders nothing until it can render a number, from 2026-09-04.** It had
 * shown "Level —" and "not tracked yet" over a 0% bar every day since it was
 * written, because it is mounted with no props at all and `Activity` has never
 * had a row written to it by anything — the table exists, its migration ran,
 * and no code path in the app inserts one.
 *
 * The original reasoning was right and the conclusion was one step short: an
 * empty panel must never be rendered as a healthy one, so it said so. But a
 * panel rendered as *permanently broken* is the same failure wearing the other
 * costume, and it had been sitting in the corner of every page for a fortnight
 * saying a thing that could not change. Rule 2 is about not being lied to, not
 * about confessing in a fixed place.
 *
 * It comes back the moment something writes an `Activity` — step 14 in
 * `docs/BUILD-PLAN.md`, deferred at Vincent's own request — with no change
 * here beyond the props arriving.
 */
export function LevelBlock({ level, remaining, weekTotal }: Props) {
  const tracked = level !== undefined && remaining !== undefined && weekTotal !== undefined;
  if (!tracked) return null;

  const fraction = weekTotal > 0 ? Math.min(1, remaining / weekTotal) : 0;

  return (
    <Panel className="mx-[10px] flex flex-col gap-[10px] px-[12px] py-[12px]">
      <div className="flex items-center gap-[8px]">
        <div
          className="flex size-[26px] shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: "var(--chip-gold)" }}
        >
          <Crown size={15} strokeWidth={1.8} className="text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-primary">Level {level}</span>
          <span className="text-[12px] text-muted-foreground">
            {remaining} of {weekTotal} left
          </span>
        </div>
      </div>

      <div className="h-[5px] overflow-hidden rounded-[3px] bg-border">
        <div
          className="h-full rounded-[3px] bg-primary transition-[width]"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </Panel>
  );
}
