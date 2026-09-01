import { prisma } from "@/lib/db/prisma";
import { monthKey, monthLabel, readCouple, type IdeaRow } from "@/lib/couple";
import { PRIORITY } from "@/lib/priority";

export type PersonRow = Awaited<ReturnType<typeof prisma.person.findMany>>[number];

export type PersonView = PersonRow & {
  /** Her own idea bank; the couple's shared one hangs off nobody. */
  ideas: IdeaRow[];
  /** Whole days since you last actually saw or spoke to them. */
  daysSince: number | null;
  /** Past the mark he set. Only ever true when he set one. */
  overdue: boolean;
  /** How far through the interval, 0 to 1, for the quiet bar. */
  fraction: number | null;
};

export type Circle = { name: string; people: PersonView[] };

export type People = {
  spouse: PersonView | null;
  children: PersonView[];
  /** Everyone else, grouped by `circle` in first-appearance order. */
  circles: Circle[];
  overdue: number;
};

const DAY_MS = 86_400_000;

/**
 * Everyone, in three kinds — PRD components 5 and 8, which stopped being two
 * things on 2026-08-31.
 *
 * Steward owns this outright; there is no source to collect it from, and the
 * PRD is blunt that no software fills it.
 *
 * **Nothing here counts anything up.** No streak, no monthly total, no score,
 * and none of it joins the XP economy when the game layer lands. PRD §6:
 * measurement alone made an activity feel like work and cut voluntary
 * continuation from 48.5% to 27.3%. Each section counts its own thing and
 * nothing counts them together.
 */
export async function readPeople(now: Date = new Date()): Promise<People> {
  const rows = await prisma.person.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { ideas: { where: { usedAt: null }, orderBy: { createdAt: "asc" } } },
  });

  const people = rows.map((person) => view(person, now));

  const circles: Circle[] = [];
  for (const person of people.filter((p) => p.kind === "contact")) {
    const name = person.circle?.trim() || "Everyone else";
    let circle = circles.find((c) => c.name === name);
    if (!circle) {
      circle = { name, people: [] };
      circles.push(circle);
    }
    circle.people.push(person);
  }

  return {
    spouse: people.find((p) => p.kind === "spouse") ?? null,
    children: people.filter((p) => p.kind === "child"),
    circles,
    overdue: people.filter((p) => p.overdue).length,
  };
}

function view(person: PersonRow & { ideas: IdeaRow[] }, now: Date): PersonView {
  const daysSince =
    person.lastContactAt === null
      ? null
      : Math.floor((now.getTime() - person.lastContactAt.getTime()) / DAY_MS);

  return {
    ...person,
    daysSince,
    overdue: isOverdue(person, now),
    // A bar rather than a number: PRD §6 draws the line between a progress
    // display, which helps, and a counter, which does the damage.
    fraction:
      daysSince !== null && person.cadenceDays !== null && person.cadenceDays > 0
        ? Math.min(1, daysSince / person.cadenceDays)
        : null,
  };
}

/**
 * The two kinds ask different questions, and both are deliberate.
 *
 * A **child** is overdue when nothing is *planned* — the thing worth surfacing
 * is an empty Saturday, not a gap since the last one — and her clock starts
 * when she was added, so a girl added today does not read as overdue by years.
 *
 * A **contact** is overdue on the gap since you last spoke, and **never before
 * a first contact is recorded**: nagging about someone you have just written
 * down is the fastest way to make the list feel like a chore.
 *
 * A **spouse** never nudges from here. The couple months do that.
 */
function isOverdue(person: PersonRow, now: Date): boolean {
  if (person.cadenceDays === null || person.kind === "spouse") return false;

  if (person.kind === "child") {
    if (person.planTitle !== null) return false;
    const since = person.lastContactAt ?? person.createdAt;
    return Math.floor((now.getTime() - since.getTime()) / DAY_MS) >= person.cadenceDays;
  }

  if (person.lastContactAt === null) return false;
  return (
    Math.floor((now.getTime() - person.lastContactAt.getTime()) / DAY_MS) > person.cadenceDays
  );
}

/**
 * Every nudge this page produces, in one function and under one source.
 *
 * Three kinds of row and **never a roll-up**, against the rule every collected
 * source here follows. "3 people are overdue" is a statistic about his
 * relationships, which is precisely what PRD §6 warns turns them into work. One
 * name and one call is an action.
 *
 * Rows are **deleted** when the thing they asked for happens, not left to be
 * dismissed — the same rule the monitors follow. Waving one away means "not
 * today", and it comes back, because it is still true.
 */
export async function syncPeopleNudges(now: Date = new Date()): Promise<string> {
  const [{ spouse, children, circles }, couple] = await Promise.all([
    readPeople(now),
    readCouple(now),
  ]);

  const wanted: string[] = [];

  // ---- The couple's open months ------------------------------------------
  // Only his. Nudging him about hers would be nagging her through him, which
  // is not what a shared planner is for.
  //
  // Two months of horizon: the planner's own goal is to plan in advance and
  // not in the last week.
  const horizon = monthKey(now, 2);
  const dueMonths = couple.openMine.filter((s) => s.month <= horizon);

  for (const slot of dueMonths) {
    const externalId = `open:${slot.month}`;
    wanted.push(externalId);

    await upsert({
      externalId,
      category: "couple",
      title: `${monthLabel(slot.month).split(" ")[0]} is your month and the slot is open`,
      subtitle:
        couple.ideas.length === 0
          ? "nothing in the idea bank yet"
          : `${couple.ideas.length} ${couple.ideas.length === 1 ? "idea" : "ideas"} waiting`,
      now,
    });
  }

  // ---- The girls ----------------------------------------------------------
  for (const child of children.filter((c) => c.overdue)) {
    const externalId = `child:${child.id}`;
    wanted.push(externalId);

    await upsert({
      externalId,
      category: "family",
      title: `Time with ${child.name}`,
      subtitle:
        child.ideas.length > 0
          ? `${child.ideas.length} ${child.ideas.length === 1 ? "idea" : "ideas"} in her bank`
          : child.daysSince === null
            ? "nothing planned yet"
            : `${child.daysSince} days since the last one`,
      now,
    });
  }

  // ---- Everyone else ------------------------------------------------------
  const contacts = circles.flatMap((c) => c.people).filter((p) => p.overdue);

  for (const person of contacts) {
    const externalId = `overdue:${person.id}`;
    wanted.push(externalId);

    const gap = person.daysSince === null ? "not recorded" : `${person.daysSince} days`;
    await upsert({
      externalId,
      category: "people",
      title: `Reach out to ${person.name}`,
      subtitle: person.intention ? `${person.intention} · ${gap}` : gap,
      now,
    });
  }

  const removed = await prisma.item.deleteMany({
    where: {
      source: "people",
      ...(wanted.length > 0 ? { externalId: { notIn: wanted } } : {}),
    },
  });

  return (
    `${dueMonths.length} open months, ${children.filter((c) => c.overdue).length} girls waiting, ` +
    `${contacts.length} to reach out to, ${removed.count} cleared` +
    (spouse === null ? ", no spouse recorded" : "")
  );
}

async function upsert(args: {
  externalId: string;
  category: "couple" | "family" | "people";
  title: string;
  subtitle: string;
  now: Date;
}) {
  await prisma.item.upsert({
    where: { source_externalId: { source: "people", externalId: args.externalId } },
    // `url` is in the update too, unlike the version this replaces — rows
    // written before the route moved heal themselves rather than pointing at
    // a redirect for ever. `status` stays untouched: waved away today stays
    // away today.
    // `priority` is in the update too, so a row written before the ladder
    // existed re-ranks on the next run rather than keeping a number nothing
    // writes any more.
    update: {
      title: args.title,
      subtitle: args.subtitle,
      url: "/people",
      priority: PRIORITY.relationship,
    },
    create: {
      source: "people",
      externalId: args.externalId,
      category: args.category,
      title: args.title,
      subtitle: args.subtitle,
      url: "/people",
      // An invitation, not a demand — but above every pending update, which is
      // the change here: a HACS card used to outrank a daughter.
      priority: PRIORITY.relationship,
      occurredAt: args.now,
    },
  });
}
