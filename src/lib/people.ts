import { prisma } from "@/lib/db/prisma";

export type PersonRow = Awaited<ReturnType<typeof prisma.person.findMany>>[number];

export type PersonView = PersonRow & {
  /** Whole days since the last recorded contact. Null when none is recorded. */
  daysSince: number | null;
  /** Past the ceiling. False whenever there is no ceiling or no contact yet. */
  overdue: boolean;
  /**
   * How far through the interval, 0 to 1, for the quiet bar on the row.
   * Null when there is nothing to be a fraction of.
   */
  fraction: number | null;
};

export type People = {
  people: PersonView[];
  overdue: number;
};

const DAY_MS = 86_400_000;

/**
 * The relationships list — PRD component 8.
 *
 * Steward owns this outright: there is no source to collect from, and the PRD
 * says plainly that no software fills it.
 *
 * **Nothing here counts anything up.** No streak, no contacts-this-month, no
 * score. PRD §6 is explicit that measurement alone made an activity feel like
 * work and cut voluntary continuation nearly in half, and that relationships
 * stay out of the XP economy entirely. What is shown is one fact per person —
 * how long it has been — because that is the thing Vincent said he wanted to
 * see, and nothing that turns it into a game.
 */
export async function readPeople(now: Date = new Date()): Promise<People> {
  const rows = await prisma.person.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });

  const people: PersonView[] = rows.map((p) => {
    const daysSince =
      p.lastContactAt === null
        ? null
        : Math.floor((now.getTime() - p.lastContactAt.getTime()) / DAY_MS);

    const overdue = daysSince !== null && p.cadenceDays !== null && daysSince > p.cadenceDays;

    return {
      ...p,
      daysSince,
      overdue,
      fraction:
        daysSince !== null && p.cadenceDays !== null && p.cadenceDays > 0
          ? Math.min(1, daysSince / p.cadenceDays)
          : null,
    };
  });

  return { people, overdue: people.filter((p) => p.overdue).length };
}

/**
 * The queue half: one small action when a ceiling nears.
 *
 * Rows are **deleted** once contact is recorded or the ceiling changes, not
 * left to be dismissed — the same rule the monitors follow. "You have not
 * called your mother in a while" is not gone-and-final when you wave it away;
 * it is gone when you call her. Dismissing one means "not today", and it comes
 * back tomorrow, which is the honest behaviour for a thing that is still true.
 *
 * One row per person and never a roll-up: "3 people are overdue" is a statistic
 * about your relationships, which is exactly what §6 warns turns them into
 * work. A row that names one person and suggests one call is an action.
 */
export async function syncPeopleNudges(now: Date = new Date()): Promise<string> {
  const { people } = await readPeople(now);
  const overdue = people.filter((p) => p.overdue);

  const wanted: string[] = [];

  for (const person of overdue) {
    const externalId = `overdue:${person.id}`;
    wanted.push(externalId);

    await prisma.item.upsert({
      where: { source_externalId: { source: "people", externalId } },
      // status untouched: waved away today stays waved away today.
      update: {
        title: `Reach out to ${person.name}`,
        subtitle: subtitle(person),
      },
      create: {
        source: "people",
        externalId,
        category: "inbox",
        title: `Reach out to ${person.name}`,
        subtitle: subtitle(person),
        // Below the day's real business. A relationship nudge is an
        // invitation, and putting it at the top would make it a demand.
        priority: 60,
        occurredAt: now,
      },
    });
  }

  const removed = await prisma.item.deleteMany({
    where: {
      source: "people",
      ...(wanted.length > 0 ? { externalId: { notIn: wanted } } : {}),
    },
  });

  return `${people.length} people, ${overdue.length} overdue, ${removed.count} cleared`;
}

function subtitle(person: PersonView): string {
  const gap = person.daysSince === null ? "not recorded" : `${person.daysSince} days`;
  return person.intention ? `${person.intention} · ${gap}` : gap;
}
