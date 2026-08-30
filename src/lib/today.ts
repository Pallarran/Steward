import { prisma } from "@/lib/db/prisma";
import { STALE_MULTIPLE } from "@/lib/systems";
import { OWNER_LABEL, todayInHouse } from "@/lib/adapters/todoist";

type TaskRow = Awaited<ReturnType<typeof prisma.task.findMany>>[number];

/** A task plus who else it belongs to. Empty when it is Vincent's alone. */
export type TodayTask = TaskRow & { sharedWith: string[] };

export type TodayTasks = {
  tasks: TodayTask[];
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

  // A task carrying another family member's label as well is shared, and the
  // card says with whom rather than quietly presenting it as Vincent's alone.
  const enriched: TodayTask[] = tasks.map((t) => ({
    ...t,
    sharedWith: t.labels.filter((l) => l !== OWNER_LABEL),
  }));

  return {
    tasks: enriched,
    overdue: enriched.filter((t) => t.dueDate < today).length,
    asOf: lastSuccessAt,
    stale,
  };
}
