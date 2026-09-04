import { TriangleAlert } from "lucide-react";

/**
 * A band, not a red sentence.
 *
 * For the one fact on a page that changes what you do today. The disabled-disk
 * warning shipped as `text-destructive` on an ordinary paragraph and read as
 * subtle, which was the wrong volume for it: **red text among black text is a
 * colour; a tinted band with a rule down its edge is an alarm.**
 *
 * The loudest thing in the app after a priority-0 queue row, and deliberately
 * rare — a page with two of these has two emergencies, and if that becomes
 * normal the band stops working. `tone` exists because the same shape is right
 * for a warning that is not yet a fault, in gold.
 *
 * **Named on 2026-09-04.** It was inline JSX inside `/systems`' Unraid card,
 * which meant nothing else could reach for it and every other page said
 * "important" some quieter, weaker way.
 */
export function Alert({
  title,
  children,
  tone = "down",
  className = "",
}: {
  title: string;
  /** The explanation under it — what it means, not what it is. */
  children?: React.ReactNode;
  tone?: "down" | "warning";
  className?: string;
}) {
  const colour = tone === "down" ? "var(--destructive)" : "var(--warning)";

  return (
    <div
      className={`flex items-start gap-[10px] rounded-[8px] border-l-[3px] px-[12px] py-[10px] ${className}`}
      style={{
        borderLeftColor: colour,
        background: `color-mix(in srgb, ${colour} 9%, transparent)`,
      }}
    >
      <TriangleAlert
        size={16}
        strokeWidth={2}
        className="mt-[2px] shrink-0"
        style={{ color: colour }}
      />
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[15px] font-semibold" style={{ color: colour }}>
          {title}
        </span>
        {children ? (
          <span className="text-[13px] leading-[1.5] text-muted-foreground">{children}</span>
        ) : null}
      </div>
    </div>
  );
}
