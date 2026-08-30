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
 * Only Home has a page. The rest are v1 sections that arrive with their build
 * steps, and they render as disabled rather than as links that go nowhere.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  ready: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: House, accent: "var(--primary)", ready: true },
  { label: "Systems", href: "/systems", icon: Server, accent: "var(--teal)", ready: false },
  { label: "Finance", href: "/finance", icon: TrendingUp, accent: "var(--primary)", ready: false },
  { label: "Family", href: "/family", icon: Users, accent: "var(--purple)", ready: false },
  { label: "People", href: "/people", icon: User, accent: "var(--rose)", ready: false },
  { label: "News", href: "/news", icon: Newspaper, accent: "var(--blue)", ready: false },
  { label: "Documents", href: "/documents", icon: FileText, accent: "var(--slate)", ready: false },
  { label: "Launcher", href: "/launcher", icon: LayoutGrid, accent: "var(--slate)", ready: false },
];
