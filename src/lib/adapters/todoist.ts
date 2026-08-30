import { prisma } from "@/lib/db/prisma";
import type { Adapter } from "./types";

const BASE = "https://api.todoist.com/api/v1";
const TIMEOUT_MS = 15_000;
const TZ = "America/Toronto";

/**
 * Tasks in the Home project carry a label per family member — Naomi,
 * Annabelle, Marylene, Vincent — and nothing there is untagged. The Today card
 * is Vincent's, so it shows only his: 6 of the 15 due, rather than the family's
 * 15.
 *
 * Todoist's Inbox is not filtered. It is his alone by definition.
 */
const OWNER_LABEL = "Vincent";

type TodoistDue = {
  date: string;
  timezone?: string | null;
  string?: string;
  is_recurring?: boolean;
};

type TodoistTask = {
  id: string;
  content: string;
  description?: string | null;
  project_id?: string | null;
  priority?: number;
  labels?: string[];
  due?: TodoistDue | null;
  added_at?: string | null;
};

type Page<T> = { results: T[]; next_cursor?: string | null };

/**
 * API v1 task objects carry no `url` field — REST v2 did, v1 does not, checked
 * against the live account where 188 of 188 tasks had none. Constructing it is
 * the only option, so it is done in one place rather than behind a `||` that
 * would read as a fallback and never fire.
 */
function taskUrl(id: string): string {
  return `https://app.todoist.com/app/task/${id}`;
}

async function getAll<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;

  // Cursor pagination. 188 tasks fit one page today, but a loop costs nothing
  // and a silently truncated list is the kind of quiet wrongness rule 2 bans.
  do {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Todoist answered ${response.status} ${response.statusText} for ${path}`);
    }

    const page = (await response.json()) as Page<T>;
    out.push(...page.results);
    cursor = page.next_cursor ?? null;
  } while (cursor);

  return out;
}

/** Today in the house's timezone, as `YYYY-MM-DD`. */
export function todayInHouse(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(now);
}

/**
 * Due or overdue, and nothing else.
 *
 * Todoist's `due.date` is either `YYYY-MM-DD` or a full ISO datetime. The
 * date-only form is a statement about a calendar day, so it is compared as a
 * calendar day rather than converted into an instant in some assumed timezone.
 */
export function isDueOrOverdue(due: TodoistDue | null | undefined, today: string): boolean {
  if (!due?.date) return false;
  return due.date.slice(0, 10) <= today;
}

export const todoistAdapter: Adapter = {
  key: "todoist",
  intervalSeconds: 300,

  async run(now) {
    const token = process.env.TODOIST_TOKEN;
    if (!token) throw new Error("TODOIST_TOKEN is not set");

    const [projects, tasks, labels] = await Promise.all([
      getAll<{ id: string; name: string; inbox_project?: boolean }>("/projects", token),
      getAll<TodoistTask>("/tasks", token),
      getAll<{ id: string; name: string }>("/labels", token),
    ]);

    // An account always has at least the Inbox, so an empty list means the
    // call succeeded but told us nothing. Writing it through would empty the
    // Today card and read as "nothing due".
    if (projects.length === 0) throw new Error("Todoist returned no projects");

    // Fail loudly if the owner label has been renamed or deleted. Filtering on
    // a label that no longer exists would match nothing, and the Today card
    // would say "Nothing is due today" — a lie, and the precise failure the
    // staleness rule exists to prevent. An amber panel is the honest outcome.
    if (!labels.some((l) => l.name === OWNER_LABEL)) {
      throw new Error(
        `Todoist has no label named "${OWNER_LABEL}" — it has ${labels.map((l) => l.name).join(", ") || "none"}`,
      );
    }

    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const today = todayInHouse(now);

    // ---- Due and overdue tasks become the live list -----------------------
    // Vincent's own, and never an Inbox task: the Inbox is the queue's, and an
    // item on both surfaces would be one thing wearing two hats.
    const inboxProjectId = projects.find((p) => p.inbox_project)?.id;
    const due = tasks.filter(
      (t) =>
        isDueOrOverdue(t.due, today) &&
        t.project_id !== inboxProjectId &&
        (t.labels ?? []).includes(OWNER_LABEL),
    );

    for (const t of due) {
      const raw = t.due!.date;
      const hasTime = raw.length > 10;

      const data = {
        content: t.content,
        description: t.description || null,
        url: taskUrl(t.id),
        projectId: t.project_id ?? null,
        projectName: t.project_id ? (projectName.get(t.project_id) ?? null) : null,
        priority: t.priority ?? 1,
        labels: t.labels ?? [],
        dueDate: raw.slice(0, 10),
        dueAt: hasTime ? new Date(raw) : null,
        isRecurring: Boolean(t.due!.is_recurring),
        seenAt: now,
      };

      await prisma.task.upsert({
        where: { externalId: t.id },
        update: data,
        create: { externalId: t.id, ...data },
      });
    }

    // Anything not in this poll has been completed, rescheduled out of range
    // or deleted in Todoist. Todoist is authoritative; Steward does not keep
    // its own opinion about what is due.
    const pruned = await prisma.task.deleteMany({ where: { seenAt: { lt: now } } });

    // ---- Todoist's Inbox becomes queue items ------------------------------
    // PRD component 4. Untriaged captures need handling, so they arrive rather
    // than merely existing. They are ticked, never dismissed.
    const inbox = inboxProjectId
      ? tasks.filter((t) => t.project_id === inboxProjectId)
      : [];

    for (const t of inbox) {
      await prisma.item.upsert({
        where: { source_externalId: { source: "todoist", externalId: t.id } },
        // status is deliberately untouched: a ticked item stays gone.
        update: {
          title: t.content,
          subtitle: t.due?.string ? `Inbox · ${t.due.string}` : "Inbox",
          url: taskUrl(t.id),
        },
        create: {
          source: "todoist",
          externalId: t.id,
          category: "inbox",
          title: t.content,
          subtitle: t.due?.string ? `Inbox · ${t.due.string}` : "Inbox",
          url: taskUrl(t.id),
          priority: 20,
          occurredAt: t.added_at ? new Date(t.added_at) : now,
        },
      });
    }

    return `${tasks.length} tasks, ${due.length} due, ${inbox.length} in inbox, ${pruned.count} pruned`;
  },
};

/**
 * Completes a task in Todoist. This is the write half, and the reason tasks
 * come from Todoist directly rather than through Home Assistant: there is no
 * local copy to drift from the cloud.
 */
export async function closeTodoistTask(externalId: string): Promise<void> {
  const token = process.env.TODOIST_TOKEN;
  if (!token) throw new Error("TODOIST_TOKEN is not set");

  const response = await fetch(`${BASE}/tasks/${encodeURIComponent(externalId)}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Todoist refused the close: ${response.status} ${response.statusText}`);
  }
}
