import {
  FileText,
  House,
  LayoutGrid,
  Newspaper,
  Server,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The eight nav items, in the order the Home mockup draws them.
 *
 * `accent` is the section's colour, and it is the only colour in the rail:
 * docs/DESIGN.md — colour only ever carries meaning, everything structural
 * stays quiet.
 *
 * Home and Systems have pages. The rest are sections that arrive with their
 * build steps — News with step 11, Launcher with step 13, and Finance, Family,
 * People and Documents in v2 and v3 — and they render as disabled rather than
 * as links that go nowhere.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  ready: boolean;
};

/**
 * The optional right-side badge — docs/DESIGN.md, Sidebar item.
 *
 * A dot for status, text for a state that needs a word. `stale` is text rather
 * than a colour on purpose: an amber dot says "something", the word says which
 * kind of something, and rule 2 is about being told rather than warned.
 */
export type NavBadge = { tone: "ok" | "down" | "stale"; text?: string };

/** Keyed by href, computed on the server and passed into the rail. */
export type NavBadges = Record<string, NavBadge>;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: House, accent: "var(--primary)", ready: true },
  { label: "Systems", href: "/systems", icon: Server, accent: "var(--teal)", ready: true },
  { label: "Finance", href: "/finance", icon: TrendingUp, accent: "var(--primary)", ready: true },
  { label: "Family", href: "/family", icon: Users, accent: "var(--purple)", ready: false },
  { label: "People", href: "/people", icon: User, accent: "var(--rose)", ready: true },
  { label: "News", href: "/news", icon: Newspaper, accent: "var(--blue)", ready: true },
  { label: "Documents", href: "/documents", icon: FileText, accent: "var(--slate)", ready: false },
  { label: "Launcher", href: "/launcher", icon: LayoutGrid, accent: "var(--slate)", ready: true },
];
