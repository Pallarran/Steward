"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, type NavBadge, type NavBadges } from "./nav";
import { Dot, TONE } from "./dot";

/** `onNavigate` lets the mobile sheet close itself on a link click. */
export function SidebarNav({
  badges = {},
  onNavigate,
}: {
  badges?: NavBadges;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex min-h-0 flex-col gap-[2px] overflow-y-auto px-[10px]">
      {NAV_ITEMS.map(({ label, href, icon: Icon, accent, ready }) => {
        const active = pathname === href;
        const badge = badges[href];
        const className =
          "flex items-center gap-[10px] rounded-[10px] px-[10px] py-[8px] text-[15px]";

        const inner = (
          <>
            <Icon size={17} strokeWidth={1.7} style={{ color: accent }} className="shrink-0" />
            <span
              className={`grow ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {badge ? <Badge badge={badge} label={label} /> : null}
          </>
        );

        // Sections without a page yet are not links. A rail full of dead links
        // teaches you to distrust the rail.
        if (!ready) {
          return (
            <div
              key={href}
              aria-disabled
              title={`${label} arrives with its build step`}
              className={`${className} cursor-default opacity-45`}
            >
              {inner}
            </div>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`${className} transition-colors ${
              active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
            }`}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A dot carries status; text carries a state that needs naming.
 *
 * The text is also the accessible label for the dot, so the rail says the same
 * thing to a screen reader that it says to an eye.
 */
/** The dot's meaning in words, so the rail says the same thing to a reader. */
const BADGE_MEANING: Record<NavBadge["tone"], string> = {
  ok: "all up",
  down: "something is down",
  degraded: "running without full redundancy",
  stale: "not known, the collector is behind",
};

function Badge({ badge, label }: { badge: NavBadge; label: string }) {
  const colour = TONE[badge.tone];

  if (badge.text) {
    return (
      <span className="shrink-0 font-mono text-[12px]" style={{ color: colour }}>
        {badge.text}
      </span>
    );
  }

  return (
    <Dot
      tone={badge.tone}
      role="img"
      aria-label={`${label}: ${BADGE_MEANING[badge.tone]}`}
    />
  );
}
