import { prisma } from "@/lib/db/prisma";

export type SlotRow = Awaited<ReturnType<typeof prisma.coupleSlot.findMany>>[number];
export type IdeaRow = Awaited<ReturnType<typeof prisma.idea.findMany>>[number];

export type Names = { mine: string; theirs: string };

export type Couple = {
  slots: SlotRow[];
  /** The shared bank — ideas belonging to nobody in particular. */
  ideas: IdeaRow[];
  /** His own months, still open, from this month on. What the nudge counts. */
  openMine: SlotRow[];
  names: Names;
  /** False when no `spouse` person is recorded, which the page says rather than guessing. */
  hasSpouse: boolean;
};

/**
 * Whose month it is by the planner's own rule: she takes odd months, he takes
 * even ones. A default, not a law — the value is stored and editable, because
 * the planner's own text says they give each other slack.
 */
export function mineFor(month: string): boolean {
  return Number(month.slice(5, 7)) % 2 === 0;
}

/** `YYYY-MM` for a month offset from now, in the house's timezone. */
export function monthKey(now: Date, offsetMonths = 0): string {
  const d = new Date(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Toronto",
    }).format(now),
  );
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

/**
 * The two names, resolved rather than hardcoded.
 *
 * `src/lib/family.ts` carried `OWNER = "Vincent"` and `PARTNER = "Marylène"` as
 * constants until 2026-08-31. With a spouse in the people list they are data:
 * his from the account, hers from the record. A stored name goes stale the
 * moment either is edited, which is why `CoupleSlot` holds a boolean now.
 */
export async function readNames(): Promise<Names> {
  const [user, spouse] = await Promise.all([
    // Exactly one user exists — docs/ARCHITECTURE.md, and nothing is scoped to
    // them, so findFirst is the honest query.
    prisma.user.findFirst({ select: { displayName: true } }),
    prisma.person.findFirst({ where: { kind: "spouse" }, select: { name: true } }),
  ]);

  return {
    mine: user?.displayName?.trim() || "You",
    theirs: spouse?.name?.trim() || "Your partner",
  };
}

export async function readCouple(now: Date = new Date()): Promise<Couple> {
  const thisMonth = monthKey(now);

  const [slots, ideas, names, spouse] = await Promise.all([
    // Past months drop off once they are done: this is a planner, not a diary.
    prisma.coupleSlot.findMany({
      where: { OR: [{ month: { gte: thisMonth } }, { status: { not: "done" } }] },
      orderBy: { month: "asc" },
    }),
    // The shared bank. A person's own ideas hang off them instead.
    prisma.idea.findMany({
      where: { usedAt: null, personId: null },
      orderBy: { createdAt: "asc" },
    }),
    readNames(),
    prisma.person.findFirst({ where: { kind: "spouse" }, select: { id: true } }),
  ]);

  return {
    slots,
    ideas,
    names,
    hasSpouse: spouse !== null,
    openMine: slots.filter((s) => s.status === "open" && s.mine && s.month >= thisMonth),
  };
}
