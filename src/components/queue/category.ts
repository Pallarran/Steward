import {
  CreditCard,
  Gamepad2,
  GraduationCap,
  Heart,
  Inbox,
  Newspaper,
  Server,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ItemCategory } from "@/generated/prisma/enums";

/**
 * The coloured chip on a queue row. Colour only ever carries meaning, and here
 * the meaning is the category — docs/DESIGN.md.
 *
 * `label` is what the row's second line says before the middot; the item's own
 * `subtitle` supplies the detail after it. The category is an enum, so the
 * label is derived rather than stored.
 */
export const CATEGORY: Record<
  ItemCategory,
  { label: string; icon: LucideIcon; accent: string; chip: string }
> = {
  systems: { label: "Systems", icon: Server, accent: "var(--teal)", chip: "var(--chip-teal)" },
  school: {
    label: "School",
    icon: GraduationCap,
    accent: "var(--purple)",
    chip: "var(--chip-purple)",
  },
  couple: { label: "Couple", icon: Heart, accent: "var(--purple)", chip: "var(--chip-purple)" },
  family: { label: "Family", icon: Users, accent: "var(--purple)", chip: "var(--chip-purple)" },
  // Rose is the People accent — docs/DESIGN.md. Before this existed, "Reach out
  // to your mother" wore the slate Inbox chip.
  people: { label: "People", icon: User, accent: "var(--rose)", chip: "var(--chip-rose)" },
  news: { label: "News", icon: Newspaper, accent: "var(--blue)", chip: "var(--chip-blue)" },
  gaming: { label: "Gaming", icon: Gamepad2, accent: "var(--blue)", chip: "var(--chip-blue)" },
  subscriptions: {
    label: "Subscriptions",
    icon: CreditCard,
    accent: "var(--primary)",
    chip: "var(--chip-gold)",
  },
  inbox: { label: "Inbox", icon: Inbox, accent: "var(--slate)", chip: "var(--chip-slate)" },
};
