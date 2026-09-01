import { ExternalLink } from "lucide-react";
import { clock, duration } from "@/lib/format";

/**
 * The heading row: title left, a faint mono detail right, an action after it.
 *
 * **`docs/DESIGN.md` argued this should not be a component** — that the rows
 * genuinely differ per page and a component with six optional props covering
 * five variants is a switch statement wearing a component's clothes. That
 * argument was wrong, and the count is the proof: the row was written out by
 * hand **seventeen times**, Systems built this exact component locally, and the
 * copies had already drifted on gap and on whether the detail links.
 *
 * The variants turned out to be one rule, not five. The right-hand slot holds,
 * in order of precedence:
 *
 * 1. **A staleness stamp**, when `stale` is passed — amber, replacing whatever
 *    else would have been there. A timestamp on a panel means, without
 *    exception, that this panel's data is old.
 * 2. **The detail**, as a link out when `href` is given and as plain text when
 *    it is not. Where a section has a source, that detail names it and links to
 *    it, so the way out to Uptime Kuma sits beside the services it is reporting
 *    rather than in a row of buttons at the bottom.
 * 3. **An action**, after the detail — usually the dialog trigger that adds to
 *    this section.
 */
export function SectionHead({
  title,
  detail,
  href,
  stale,
  now,
  action,
  as: Tag = "div",
}: SectionHeadProps & { as?: "div" | "header" }) {
  return (
    <Tag className="flex items-baseline justify-between gap-[12px]">
      <h2 className="text-[16px] font-semibold">{title}</h2>

      <div className="flex shrink-0 items-baseline gap-[10px]">
        {stale !== undefined ? (
          <span className="font-mono text-[12px] text-warning">
            {stale && now ? `as of ${clock(stale)}, ${duration(stale, now)} ago` : "never answered"}
          </span>
        ) : href && detail ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[6px] font-mono text-[12px] text-faint transition-colors hover:text-primary"
          >
            {detail}
            <ExternalLink size={12} strokeWidth={1.8} />
          </a>
        ) : detail ? (
          <span className="font-mono text-[12px] text-faint">{detail}</span>
        ) : null}

        {action}
      </div>
    </Tag>
  );
}

export type SectionHeadProps = {
  title: string;
  /** The faint mono line on the right. Omit for a heading with nothing to say. */
  detail?: string;
  /** Makes `detail` the way out to the source it names. */
  href?: string;
  /**
   * Pass only when this section's source *is* stale — `null` for a source that
   * has never answered. Leaving it `undefined` means the question does not
   * apply here, which is not the same as "fresh".
   */
  stale?: Date | null;
  now?: Date;
  /** Usually the dialog trigger that adds to this section. */
  action?: React.ReactNode;
};

/**
 * A titled band: the heading row, then the content under it.
 *
 * Where the heading belongs *inside* a card instead — the Home cards, the
 * Settings sections — use `Panel` with a bare `SectionHead`. That is the same
 * row in a different container, not a second kind of heading.
 */
export function Section({
  className = "",
  children,
  ...head
}: SectionHeadProps & { className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-[12px] ${className}`}>
      <SectionHead {...head} />
      {children}
    </section>
  );
}
