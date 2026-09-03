import { prisma } from "@/lib/db/prisma";
import { PRIORITY } from "@/lib/priority";
import { writeFact } from "@/lib/facts";
import { OWNER_LABEL } from "@/lib/triage";

/**
 * What an Inbox item carries for its detail dialog.
 *
 * **The Inbox is the one Todoist surface Steward stores nothing else about.**
 * `Task` holds what is due, and deliberately excludes Inbox tasks — "the Inbox
 * is the queue's, and an item on both surfaces would be one thing wearing two
 * hats" — so joining an Inbox item to a task returns null, always. The note,
 * labels and due phrase travel on the item instead.
 */
export type TodoistDetail = {
  description: string | null;
  labels: string[];
  projectName: string | null;
  /** Todoist's own phrasing — "tomorrow at 9am", "every Monday". */
  due: string | null;
};
import { request } from "./http";
import type { Adapter } from "./types";

const BASE = "https://api.todoist.com/api/v1";
const TIMEOUT_MS = 15_000;
const TZ = "America/Toronto";

/**
 * Which family member's tasks the Today card shows — 6 of the 15 due, rather
 * than the family's 15. Todoist's Inbox is not filtered; it is his alone by
 * definition.
 *
 * **Defined in `lib/triage.ts` and re-exported here**, because the triage
 * controls need it as their default and they run in the browser, where nothing
 * from this module can go: it imports Prisma. Re-exported so the readers that
 * already had it from here did not have to move.
 */
export { OWNER_LABEL };

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

    const response = await request(url, {
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
 * How far ahead tasks are collected.
 *
 * **Tomorrow, and no further.** The filter used to be "due or overdue, and
 * nothing else", which meant the `Task` table was exactly the set of things
 * needing attention now and every reader could treat it that way. The Today
 * card's *Upcoming* section needs the next day, so the table is no longer that
 * set and **every reader must now filter by `dueDate` explicitly** rather than
 * assume.
 *
 * It was seven for one commit. On a 179-task account a week of tasks dwarfed
 * the two things actually due today, which is the opposite of what a glance
 * card is for — and it crowded out the things that genuinely belong under
 * *Upcoming*, like tomorrow's school day. Widening this again means answering
 * the question that killed the week: what does a longer list let Vincent decide
 * that a shorter one does not?
 */
export const HORIZON_DAYS = 1;

/**
 * Anything overdue, due today, or due within `HORIZON_DAYS` — tomorrow.
 *
 * Todoist's `due.date` is either `YYYY-MM-DD` or a full ISO datetime. The
 * date-only form is a statement about a calendar day, so it is compared as a
 * calendar day rather than converted into an instant in some assumed timezone —
 * which is also why the horizon is computed as a date string rather than by
 * adding milliseconds to an instant.
 */
export function isWithinHorizon(
  due: TodoistDue | null | undefined,
  today: string,
  horizon: string,
): boolean {
  if (!due?.date) return false;
  return due.date.slice(0, 10) <= horizon;
}

/** `today` plus `days`, as the calendar day it lands on in the house. */
export function horizonDay(now: Date, days: number = HORIZON_DAYS): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return todayInHouse(d);
}

/**
 * Where a thought can be filed, and who it can be given to.
 *
 * **Every poll already fetches both lists and throws them away** after building
 * a name map, so carrying them costs no request. Storing them is what lets the
 * triage controls read the database like every other reader instead of calling
 * Todoist to fill a dropdown — rule 1, and the reason there is no adapter call
 * anywhere in a render path.
 *
 * Null until the first successful poll. A caller must render that as not
 * collected rather than as an account with no projects.
 */
export const TODOIST_LISTS = "todoist:lists";

export type TodoistLists = {
  /** Everything but the Inbox — the places something can be filed *to*. */
  projects: { id: string; name: string }[];
  /** The Inbox's own id, which the undo needs to put a task back. */
  inboxId: string | null;
  /** Label names, in Todoist's order. On this account, the family. */
  labels: string[];
};

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
    const horizon = horizonDay(now);

    // ---- Overdue, due today and due tomorrow become the live list --------
    // Vincent's own, and never an Inbox task: the Inbox is the queue's, and an
    // item on both surfaces would be one thing wearing two hats.
    const inboxProjectId = projects.find((p) => p.inbox_project)?.id;

    // The triage controls' options, from lists this poll already holds.
    await writeFact(
      TODOIST_LISTS,
      "todoist",
      {
        projects: projects
          .filter((p) => !p.inbox_project)
          .map((p) => ({ id: p.id, name: p.name })),
        inboxId: inboxProjectId ?? null,
        labels: labels.map((l) => l.name),
      } satisfies TodoistLists,
      now,
    );

    const due = tasks.filter(
      (t) =>
        isWithinHorizon(t.due, today, horizon) &&
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
      const subtitle = t.due?.string ? `Inbox · ${t.due.string}` : "Inbox";

      // What the detail dialog shows, carried on the item because there is
      // nothing to join to. The obvious alternative — putting Inbox tasks in
      // `Task` alongside the due ones — costs far more than it looks: `dueDate`
      // is a required String there, and most Inbox captures have no due date at
      // all, so it would have to become nullable and every reader of a task's
      // date would need re-checking. See the note in `Item.detail`.
      const detail = {
        description: t.description?.trim() || null,
        labels: t.labels ?? [],
        projectName: "Inbox",
        due: t.due?.string ?? null,
      } satisfies TodoistDetail;

      await prisma.item.upsert({
        where: { source_externalId: { source: "todoist", externalId: t.id } },
        // status is deliberately untouched: a ticked item stays gone.
        update: {
          title: t.content,
          // Detail only: the row leads with "Todoist".
          subtitle,
          url: taskUrl(t.id),
          detail,
          // In the update, not only the create — see the rule in lib/priority.ts.
          // Without this the Inbox stayed at the rank it was written with, so
          // moving it to the bottom of the ladder changed nothing at all for
          // rows that already existed, which is all of them.
          priority: PRIORITY.inbox,
        },
        create: {
          source: "todoist",
          externalId: t.id,
          category: "inbox",
          title: t.content,
          subtitle,
          url: taskUrl(t.id),
          detail,
          priority: PRIORITY.inbox,
          occurredAt: t.added_at ? new Date(t.added_at) : now,
        },
      });
    }

    return `${tasks.length} tasks, ${due.length} due, ${inbox.length} in inbox, ${pruned.count} pruned`;
  },
};

/**
 * Creates a task in Todoist's Inbox from a captured thought.
 *
 * No project is named, so it lands in the Inbox — the honest destination for
 * something not yet decided about, and the place Vincent already triages.
 *
 * Returns the created task so the caller can write the queue row immediately
 * rather than waiting up to five minutes for the next poll. That row carries
 * the real Todoist id, so the next poll upserts the same
 * `(todoist, externalId)` and changes nothing.
 */
export async function createTodoistTask(content: string): Promise<{
  id: string;
  content: string;
  addedAt: Date;
  url: string;
}> {
  const token = process.env.TODOIST_TOKEN;
  if (!token) throw new Error("TODOIST_TOKEN is not set");

  const response = await request(`${BASE}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Todoist refused the task: ${response.status} ${response.statusText}`);
  }

  const task = (await response.json()) as { id: string; content: string; added_at?: string };
  return {
    id: task.id,
    content: task.content,
    addedAt: task.added_at ? new Date(task.added_at) : new Date(),
    url: taskUrl(task.id),
  };
}

/**
 * Completes a task in Todoist. This is the write half, and the reason tasks
 * come from Todoist directly rather than through Home Assistant: there is no
 * local copy to drift from the cloud.
 */
export async function closeTodoistTask(externalId: string): Promise<void> {
  await write(externalId, "close", "refused the close");
}

/**
 * Puts a closed task back.
 *
 * The undo half of the tick. Unlike undoing a dismissal — which flips a column
 * in Steward's own database — this is a second network write that can fail, so
 * the caller must say so rather than quietly leaving Steward and Todoist with
 * different opinions about whether the task is done.
 */
export async function reopenTodoistTask(externalId: string): Promise<void> {
  await write(externalId, "reopen", "refused to reopen it");
}

async function write(externalId: string, verb: string, complaint: string): Promise<void> {
  const token = process.env.TODOIST_TOKEN;
  if (!token) throw new Error("TODOIST_TOKEN is not set");

  const response = await request(`${BASE}/tasks/${encodeURIComponent(externalId)}/${verb}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Todoist ${complaint}: ${response.status} ${response.statusText}`);
  }
}

/* ------------------------------------------------- triaging an Inbox task */

/**
 * What a task can be changed to. An absent field is left alone.
 *
 * **`dueDate` is one field and two wire fields, deliberately.** Setting a date
 * goes as `due_date`, which takes a bare `YYYY-MM-DD` and involves no parsing
 * at all. Clearing one has no equivalent — the only documented way to remove a
 * due date is the phrase `"no date"` in `due_string` — so that path also sends
 * `due_lang: "en"`, because `due_string` is otherwise read in the account's own
 * language and an English phrase in a French account parses as a task named
 * "no date" rather than as an instruction.
 */
export type TaskPatch = {
  content?: string;
  labels?: string[];
  /** `YYYY-MM-DD` to set it, `null` to take it away. */
  dueDate?: string | null;
  /**
   * Todoist's own phrasing, handed straight back to it — "tomorrow at 9am",
   * "every Monday".
   *
   * **Only for restoring what Todoist itself said**, which is why the language
   * problem above does not apply: the string came from this account, in this
   * account's language. It is also the only way to put a *recurrence* back,
   * which `due_date` cannot express at all. Never construct one.
   */
  dueString?: string;
};

/**
 * Changes a task in place — `POST /tasks/{id}`, which is an update in v1 rather
 * than the PATCH the shape suggests.
 *
 * **It cannot move a task between projects.** The reference lists `project_id`
 * among the body fields and there is a separate `/move` operation, which is the
 * tell: filing something into Home is two calls, and `moveTodoistTask` is the
 * one that does it.
 */
export async function updateTodoistTask(externalId: string, patch: TaskPatch): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.content !== undefined) body.content = patch.content;
  if (patch.labels !== undefined) body.labels = patch.labels;

  if (patch.dueString !== undefined) {
    body.due_string = patch.dueString;
  } else if (patch.dueDate === null) {
    body.due_string = "no date";
    body.due_lang = "en";
  } else if (patch.dueDate !== undefined) {
    body.due_date = patch.dueDate;
  }

  if (Object.keys(body).length === 0) return;

  await send(`/tasks/${encodeURIComponent(externalId)}`, "POST", body, "refused the change");
}

/** Moves a task to another project — `POST /tasks/{id}/move`. */
export async function moveTodoistTask(externalId: string, projectId: string): Promise<void> {
  await send(
    `/tasks/${encodeURIComponent(externalId)}/move`,
    "POST",
    { project_id: projectId },
    "refused the move",
  );
}

/**
 * Deletes a task outright.
 *
 * **The one write here Todoist cannot undo.** Completing a task can be
 * reopened and a move can be moved back; there is no API to bring a deleted
 * task back, which is why the control that calls this confirms rather than
 * offering an undo.
 */
export async function deleteTodoistTask(externalId: string): Promise<void> {
  await send(`/tasks/${encodeURIComponent(externalId)}`, "DELETE", null, "refused the delete");
}

/** The bodied sibling of `write`, which only knows bodyless verb endpoints. */
async function send(
  path: string,
  method: string,
  body: unknown | null,
  complaint: string,
): Promise<void> {
  const token = process.env.TODOIST_TOKEN;
  if (!token) throw new Error("TODOIST_TOKEN is not set");

  const response = await request(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === null ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Todoist ${complaint}: ${response.status} ${response.statusText}`);
  }
}
