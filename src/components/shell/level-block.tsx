import { Crown } from "lucide-react";
import { Panel } from "./panel";

type Props = {
  /** Both arrive in step 11, derived from Activity. Nothing stores a score. */
  level?: number;
  remaining?: number;
  weekTotal?: number;
};

/**
 * Pinned to the bottom of the rail.
 *
 * The bar **drains** as the week is worked, so it agrees with the words beside
 * it — docs/DESIGN.md. It shows what is left, never what has been banked.
 *
 * Until step 11 there is no Activity table to derive any of this from, so it
 * says so rather than showing a plausible number. An empty panel is never
 * rendered as a healthy one.
 */
export function LevelBlock({ level, remaining, weekTotal }: Props) {
  const tracked = level !== undefined && remaining !== undefined && weekTotal !== undefined;
  const fraction = tracked && weekTotal > 0 ? Math.min(1, remaining / weekTotal) : 0;

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
          <span className="text-[14px] font-semibold text-primary">
            {tracked ? `Level ${level}` : "Level —"}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {tracked ? `${remaining} of ${weekTotal} left` : "not tracked yet"}
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
