import { prisma } from "@/lib/db/prisma";
import { STALE_MULTIPLE } from "@/lib/systems";
import { OWNER_LABEL, todayInHouse } from "@/lib/adapters/todoist";
import { MEAL_CALENDAR, SCHOOL_DAY_CALENDAR, WASTE_CALENDARS } from "@/lib/adapters/ha";

type TaskRow = Awaited<ReturnType<typeof prisma.task.findMany>>[number];
export type EventRow = Awaited<ReturnType<typeof prisma.calendarEvent.findMany>>[number];

/** A task plus who else it belongs to. Empty when it is Vincent's alone. */
export type TodayTask = TaskRow & { sharedWith: string[] };

export type Source = { asOf: Date | null; stale: boolean };

export type Today = {
  /**
   * Three lists, not one flat one with a "late" tag per row.
   *
   * They answer different questions and deserve different weights: *late* is
   * something that has already slipped, *due today* is the commitment, and
   * *upcoming* is what the week holds. A single list ordered by date buried the
   * first inside the third.
   *
   * **Every reader must filter by `dueDate`.** The `Task` table was exactly
   * "due or overdue" until 2026-08-31 and could be rendered wholesale; it now
   * carries the week ahead as well — `HORIZON_DAYS` in the Todoist adapter.
   */
  late: TodayTask[];
  dueToday: TodayTask[];
  upcoming: TodayTask[];
  events: EventRow[];
  /**
   * Tomorrow's appointments, for the Ahead card.
   *
   * **Added 2026-09-01, because they were rendered nowhere.** `events` is
   * `startDate === today` and `AheadCard` never received it, so an appointment
   * on `calendar.family` tomorrow sat in the database and appeared on no page —
   * even though the collector's window is eight days and `schoolDayTomorrow`
   * and `waste` were already looking past today from the same rows.
   */
  tomorrowEvents: EventRow[];
  /**
   * The rest of the collector's window — the day after tomorrow onward,
   * grouped by day.
   *
   * **Added 2026-09-04, and it is the same bug as `tomorrowEvents` one step
   * further out.** The Home Assistant adapter's window is eight days; this
   * module surfaced two of them. So six days of appointments sat in Postgres
   * and appeared on no page in Steward, which is the exact fault the comment
   * above records being caught for tomorrow on 2026-09-01.
   *
   * **Events only.** `HORIZON_DAYS` bounds Todoist to tomorrow, and
   * `docs/BUILD-PLAN.md` records that widening it to seven was tried and
   * reverted — a week of tasks dwarfed the two things actually due today. The
   * card has to say so rather than let an empty Saturday read as a free one.
   */
  weekEvents: { date: string; events: EventRow[] }[];
  /** Tonight's meal from the meal plan. */
  meal: string | null;
  /** The next collection within the window, and whether it needs acting on. */
  waste: { what: string; date: string; imminent: boolean } | null;
  /** Tomorrow's cycle day, which is what the school calendar actually holds. */
  schoolDayTomorrow: string | null;
  /** Per-source, because one going stale must not discredit the other. */
  todoist: Source;
  ha: Source;
};

function staleness(
  status: { lastSuccessAt: Date | null; intervalSeconds: number } | null,
  fallbackInterval: number,
  now: Date,
): Source {
  const asOf = status?.lastSuccessAt ?? null;
  const interval = status?.intervalSeconds ?? fallbackInterval;
  return {
    asOf,
    stale: asOf === null || now.getTime() - asOf.getTime() > interval * STALE_MULTIPLE * 1000,
  };
}

function isoDay(now: Date, offsetDays: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return todayInHouse(d);
}

/**
 * Everything time-bound today, whatever its source.
 *
 * Tasks and events are read separately and their staleness is tracked
 * separately: Todoist failing must not make the calendar look wrong, and the
 * card says which half is out of date rather than dimming both.
 */
export async function readToday(now: Date = new Date()): Promise<Today> {
  const [statuses, taskRows, eventRows] = await Promise.all([
    prisma.sourceStatus.findMany({ where: { source: { in: ["todoist", "ha"] } } }),
    prisma.task.findMany({
      orderBy: [{ dueDate: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    }),
    prisma.calendarEvent.findMany({
      orderBy: [{ startDate: "asc" }, { allDay: "desc" }, { startAt: "asc" }],
    }),
  ]);

  const today = todayInHouse(now);
  const tomorrow = isoDay(now, 1);

  const tasks: TodayTask[] = taskRows.map((t) => ({
    ...t,
    sharedWith: t.labels.filter((l) => l !== OWNER_LABEL),
  }));

  const special = new Set([MEAL_CALENDAR, SCHOOL_DAY_CALENDAR, ...WASTE_CALENDARS]);

  // Meal, waste and the school day are rendered as their own lines, so they
  // are pulled out rather than listed among the appointments.
  const meal = eventRows.find((e) => e.calendarId === MEAL_CALENDAR && e.startDate === today);

  const nextWaste = eventRows
    .filter((e) => WASTE_CALENDARS.includes(e.calendarId) && e.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const schoolTomorrow = eventRows.find(
    (e) => e.calendarId === SCHOOL_DAY_CALENDAR && e.startDate === tomorrow,
  );

  // The day after tomorrow onward, grouped. `eventRows` is already ordered by
  // `startDate` then time, so a Map keeps the days in order and the events
  // inside each of them in theirs.
  const byDay = new Map<string, EventRow[]>();
  for (const e of eventRows) {
    if (e.startDate <= tomorrow || special.has(e.calendarId)) continue;
    byDay.set(e.startDate, [...(byDay.get(e.startDate) ?? []), e]);
  }

  return {
    late: tasks.filter((t) => t.dueDate < today),
    dueToday: tasks.filter((t) => t.dueDate === today),
    upcoming: tasks.filter((t) => t.dueDate > today),
    events: eventRows.filter((e) => e.startDate === today && !special.has(e.calendarId)),
    tomorrowEvents: eventRows.filter(
      (e) => e.startDate === tomorrow && !special.has(e.calendarId),
    ),
    weekEvents: [...byDay].map(([date, events]) => ({ date, events })),
    meal: meal?.summary ?? null,
    waste: nextWaste
      ? {
          what: nextWaste.summary,
          date: nextWaste.startDate,
          // Tonight is when the bin goes out, so today and tomorrow both count.
          imminent: nextWaste.startDate === today || nextWaste.startDate === tomorrow,
        }
      : null,
    schoolDayTomorrow: schoolTomorrow?.summary ?? null,
    todoist: staleness(statuses.find((s) => s.source === "todoist") ?? null, 300, now),
    ha: staleness(statuses.find((s) => s.source === "ha") ?? null, 300, now),
  };
}
