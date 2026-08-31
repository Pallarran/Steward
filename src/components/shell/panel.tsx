/**
 * A bordered card. The most-copied literal in the app until 2026-08-31, when it
 * existed four times over in Systems, Finance, People and Documents.
 *
 * Radius 10px, `bg-card`, quiet border — docs/DESIGN.md.
 *
 * **Three paddings, not ten.** The literal was written out seventeen times with
 * ten different padding pairs — `px-[18px] py-[17px]` and `px-[16px] py-[14px]`
 * side by side on the same screen, differing by amounts no one chose. There are
 * genuinely three sizes here and no more, all on the spacing scale:
 *
 * - `row` — one record in a list, tight vertically so a stack of them reads as
 *   a list rather than as a column of boxes.
 * - `default` — a small card that is a thing rather than a row.
 * - `lg` — the page's main furniture: the Home cards, the Settings sections,
 *   the gate and a News topic.
 */
const PAD = {
  row: "px-[16px] py-[12px]",
  default: "px-[16px] py-[16px]",
  lg: "px-[20px] py-[16px]",
} as const;

export function Panel({
  pad = "default",
  as: Tag = "div",
  children,
  className = "",
}: {
  pad?: keyof typeof PAD;
  /** `section` where the card is a landmark rather than a box. */
  as?: "div" | "section";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag className={`rounded-[10px] border bg-card ${PAD[pad]} ${className}`}>{children}</Tag>
  );
}
