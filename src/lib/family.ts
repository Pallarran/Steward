import { prisma } from "@/lib/db/prisma";

export type SlotRow = Awaited<ReturnType<typeof prisma.coupleSlot.findMany>>[number];
export type IdeaRow = Awaited<ReturnType<typeof prisma.idea.findMany>>[number];
export type KidRow = Awaited<ReturnType<typeof prisma.kid.findMany>>[number];

export type KidView = KidRow & {
  ideas: IdeaRow[];
  /** Days since one-on-one time actually happened. Null when none is recorded. */
  daysSince: number | null;
  /** No plan, and past the mark he set. Only ever true when he set one. */
  overdue: boolean;
};

export type Family = {
  slots: SlotRow[];
  ideas: IdeaRow[];
  kids: KidView[];
  /** Vincent's own months that still have no plan. What the nudge counts. */
  openForVincent: SlotRow[];
};

const DAY_MS = 86_400_000;

/** Marylène plans odd months, Vincent even ones — the planner's own rule. */
export const OWNER = "Vincent";
export const PARTNER = "Marylène";

export function plannerFor(month: string): string {
  const n = Number(month.slice(5, 7));
  return n % 2 === 0 ? OWNER : PARTNER;
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
  const d = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export async function readFamily(now: Date = new Date()): Promise<Family> {
  const thisMonth = monthKey(now);

  const [slots, ideas, kidRows] = await Promise.all([
    // Past months drop off on their own once they are done: this is a planner,
    // not a diary.
    prisma.coupleSlot.findMany({
      where: { OR: [{ month: { gte: thisMonth } }, { status: { not: "done" } }] },
      orderBy: { month: "asc" },
    }),
    // The couple's bank. A girl's ideas live in the same table, scoped to her.
    prisma.idea.findMany({
      where: { usedAt: null, kidId: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.kid.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { ideas: { where: { usedAt: null }, orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const kids: KidView[] = kidRows.map((kid) => {
    // Before any outing is recorded, the clock starts when she was added —
    // otherwise a girl added today would read as overdue by years.
    const since = kid.lastOutingAt ?? kid.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);

    return {
      ...kid,
      daysSince: kid.lastOutingAt === null ? null : days,
      overdue: kid.planTitle === null && kid.cadenceDays !== null && days >= kid.cadenceDays,
    };
  });

  return {
    slots,
    ideas,
    kids,
    openForVincent: slots.filter(
      (s) => s.status === "open" && s.planner === OWNER && s.month >= thisMonth,
    ),
  };
}

/**
 * The queue half: "December is your month and the slot is open".
 *
 * **Only Vincent's months.** Nudging him about Marylène's would be nagging her
 * through him, which is not what a shared planner is for.
 *
 * The subtitle counts the ideas waiting, because the answer to an open slot is
 * usually already in the bank — that is what the bank is for, and it turns the
 * row from a reminder into something you can act on in one click.
 *
 * Deleted once the slot stops being open, not left to be dismissed: the same
 * rule the monitors and the relationship nudges follow. Waving it away means
 * "not today"; it is gone when there is a plan.
 */
export async function syncFamilyNudges(now: Date = new Date()): Promise<string> {
  const { openForVincent, ideas, kids } = await readFamily(now);

  // Far enough ahead to actually book something, near enough to be real. The
  // planner's own goal says plan in advance, not in the last week.
  const horizon = monthKey(now, 2);
  const due = openForVincent.filter((s) => s.month <= horizon);

  const wanted: string[] = [];

  for (const slot of due) {
    const externalId = `open:${slot.month}`;
    wanted.push(externalId);

    const title = `${monthLabel(slot.month).split(" ")[0]} is your month and the slot is open`;
    const subtitle =
      ideas.length === 0
        ? "nothing in the idea bank yet"
        : `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"} waiting`;

    await prisma.item.upsert({
      where: { source_externalId: { source: "family", externalId } },
      update: { title, subtitle },
      create: {
        source: "family",
        externalId,
        category: "couple",
        title,
        subtitle,
        url: "/family",
        priority: 50,
        occurredAt: now,
      },
    });
  }

  // One row per girl with no plan, past the mark he set. Never rolled up: "2
  // girls need time with you" is a statistic about his children, and the whole
  // point is one name and one afternoon.
  for (const kid of kids.filter((k) => k.overdue)) {
    const externalId = `kid:${kid.id}`;
    wanted.push(externalId);

    const subtitle =
      kid.ideas.length > 0
        ? `${kid.ideas.length} ${kid.ideas.length === 1 ? "idea" : "ideas"} in her bank`
        : kid.daysSince === null
          ? "nothing planned yet"
          : `${kid.daysSince} days since the last one`;

    await prisma.item.upsert({
      where: { source_externalId: { source: "family", externalId } },
      update: { title: `Time with ${kid.name}`, subtitle },
      create: {
        source: "family",
        externalId,
        category: "family",
        title: `Time with ${kid.name}`,
        subtitle,
        url: "/family",
        // Same level as the couple slot. An invitation, not a demand.
        priority: 50,
        occurredAt: now,
      },
    });
  }

  const removed = await prisma.item.deleteMany({
    where: {
      source: "family",
      ...(wanted.length > 0 ? { externalId: { notIn: wanted } } : {}),
    },
  });

  const kidsDue = kids.filter((k) => k.overdue).length;
  return `${due.length} open slots, ${ideas.length} ideas, ${kidsDue} girls waiting, ${removed.count} cleared`;
}
