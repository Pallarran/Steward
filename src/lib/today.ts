import { prisma } from "@/lib/db/prisma";
import { STALE_MULTIPLE } from "@/lib/systems";
import { todayInHouse } from "@/lib/adapters/todoist";

export type TodayTasks = {
  tasks: Awaited<ReturnType<typeof prisma.task.findMany>>;
  overdue: number;
  /** Drives the "as of" stamp. Null means the collector has never succeeded. */
  asOf: Date | null;
  stale: boolean;
};

/**
 * What is due today, plus what is late.
 *
 * Overdue first, then today's, because a thing you have already missed
 * outranks a thing you have not. Within a day, timed tasks come before
 * untimed ones — an untimed task is due "today", not "at midnight".
 */
export async function readTodayTasks(now: Date = new Date()): Promise<TodayTasks> {
  const status = await prisma.sourceStatus.findUnique({ where: { source: "todoist" } });

  const lastSuccessAt = status?.lastSuccessAt ?? null;
  const stale =
    lastSuccessAt === null ||
    now.getTime() - lastSuccessAt.getTime() >
      (status?.intervalSeconds ?? 300) * STALE_MULTIPLE * 1000;

  const tasks = await prisma.task.findMany({
    orderBy: [{ dueDate: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
  });

  const today = todayInHouse(now);

  return {
    tasks,
    overdue: tasks.filter((t) => t.dueDate < today).length,
    asOf: lastSuccessAt,
    stale,
  };
}
