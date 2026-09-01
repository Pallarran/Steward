"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { deleteSession, validateSession } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/require-auth";
import { PRIORITY } from "@/lib/priority";
import { closeTodoistTask, createTodoistTask, reopenTodoistTask } from "@/lib/adapters/todoist";
import { markRead, markUnread } from "@/lib/adapters/gmail";

/**
 * What an undoable action hands back.
 *
 * Steward's rule for anything destructive, stated once and applied everywhere:
 * **undo where the row can come back, confirm where it cannot.** A dismissal
 * flips a column, so it gets an undo; deleting a person cascades their ideas,
 * so it gets a confirmation. Horizon puts both on the same delete and its own
 * notes call that pure friction.
 */
export type Undoable = { error: string | null };

export async function logout() {
  const session = await validateSession();
  if (session) await deleteSession(session.id);
  redirect("/login");
}

/**
 * Dismissal is only for items where "gone" is true and final — a read article,
 * a notification you have taken in. A still-due task is ticked, never
 * dismissed: hiding it would create a private notion of "cleared" that Todoist
 * does not share, and the two would drift.
 *
 * The row is kept rather than deleted, so the adapter that produced it does
 * not simply re-create it on the next run: `(source, externalId)` still
 * matches, and a dismissed item stays dismissed.
 */
export async function dismissItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to dismiss." };

  await prisma.item.update({
    where: { id },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  revalidatePath("/");
  return { error: null };
}

/**
 * Puts a dismissed row back where it was.
 *
 * Free, and that is the whole argument for it: the row was never deleted, so
 * this is one column and a null. `priority` and `occurredAt` are untouched, so
 * it returns to its old position rather than to the top.
 */
export async function undismissItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to restore." };

  await prisma.item.update({
    where: { id },
    data: { status: "new", dismissedAt: null },
  });

  revalidatePath("/");
  return { error: null };
}

/**
 * Ticks a task due today. Closes it in Todoist first and only then drops the
 * local row: if Todoist refuses, the task stays on the card rather than
 * vanishing from a list Todoist still considers open. Steward never holds an
 * opinion about completion that Todoist does not share.
 */
export async function tickTask(externalId: string): Promise<Undoable> {
  await requireAuth();
  if (!externalId) return { error: "Nothing to tick." };

  try {
    await closeTodoistTask(externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Todoist refused the tick." };
  }

  await prisma.task.deleteMany({ where: { externalId } });
  revalidatePath("/");
  return { error: null };
}

/**
 * Undoes a tick, in Todoist.
 *
 * Not free, unlike undoing a dismissal: this is a second network write. If it
 * fails the caller must say so — Steward holding a task open that Todoist
 * considers closed is exactly the drift that keeping tasks in Todoist rather
 * than Home Assistant was meant to prevent.
 *
 * The local row is not recreated. The next poll is five minutes away and will
 * bring it back with Todoist's own idea of its due date, which is the only
 * version worth having.
 */
export async function untickTask(externalId: string): Promise<Undoable> {
  await requireAuth();
  if (!externalId) return { error: "Nothing to restore." };

  try {
    await reopenTodoistTask(externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Todoist refused to reopen it." };
  }

  revalidatePath("/");
  return { error: null };
}

/**
 * Ticks a Todoist Inbox item sitting in the queue.
 *
 * Rule 3: tasks get ticked, not dismissed. The row is then marked dismissed so
 * it leaves the queue at once, which is honest here because the task really is
 * complete — the next poll will not return it either.
 */
export async function tickItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to tick." };

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.source !== "todoist") return { error: "That is not a Todoist task." };

  try {
    await closeTodoistTask(item.externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Todoist refused the tick." };
  }

  await prisma.item.update({
    where: { id },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  revalidatePath("/");
  return { error: null };
}

/** Reopens the task in Todoist and puts the queue row back. */
export async function untickItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to restore." };

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return { error: "That row is gone." };

  try {
    await reopenTodoistTask(item.externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Todoist refused to reopen it." };
  }

  await prisma.item.update({ where: { id }, data: { status: "new", dismissedAt: null } });
  revalidatePath("/");
  return { error: null };
}

/**
 * Marks the message read in Gmail, which is what actually clears a mail row.
 *
 * **The same shape as `tickItem`, for the same reason.** Rule 3 only lets a row
 * be dismissed when "gone" is true and final, and an unread message hidden in
 * Steward is not gone — the collector searches `is:unread`, so the row would
 * return within five minutes. The flag has to move in Gmail.
 *
 * The local row is dismissed too rather than waiting for the next poll: without
 * it the row sits there for up to five minutes after being pressed, which reads
 * as a control that did nothing.
 */
export async function readMailItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to mark." };

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.source !== "gmail") return { error: "That is not a message." };

  try {
    await markRead(item.externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Gmail refused it." };
  }

  await prisma.item.update({
    where: { id },
    data: { status: "dismissed", dismissedAt: new Date() },
  });

  revalidatePath("/");
  return { error: null };
}

/** Clears the flag again in Gmail and puts the row back. */
export async function unreadMailItem(id: string): Promise<Undoable> {
  await requireAuth();
  if (!id) return { error: "Nothing to restore." };

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return { error: "That row is gone." };

  try {
    await markUnread(item.externalId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Gmail refused it." };
  }

  await prisma.item.update({ where: { id }, data: { status: "new", dismissedAt: null } });
  revalidatePath("/");
  return { error: null };
}

export type CaptureState = { error: string | null; text?: string };

/**
 * Quick capture. Straight into Todoist's Inbox, not into an inbox of Steward's
 * own.
 *
 * Vincent's call, and it removes a source of truth rather than syncing two:
 * Steward's inbox and Todoist's were the same idea in two places, and the
 * promote button existed only to move between them. Todoist's Inbox is where
 * he already triages, so that is where a thought belongs.
 *
 * The row is written here from the POST response rather than waiting for the
 * next poll, so it appears at once. It carries the real Todoist id, so the
 * poll upserts the same `(todoist, externalId)` and changes nothing.
 *
 * On failure the text comes back with the error so the thought is not lost.
 * That is the one thing a capture box may never do.
 */
export async function captureThought(
  _prev: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  await requireAuth();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: null };
  if (text.length > 500) {
    return { error: "That is longer than a thought. Make it a task instead.", text };
  }

  let task;
  try {
    task = await createTodoistTask(text);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Todoist refused it.", text };
  }

  await prisma.item.upsert({
    where: { source_externalId: { source: "todoist", externalId: task.id } },
    update: {},
    create: {
      source: "todoist",
      externalId: task.id,
      category: "inbox",
      title: task.content,
      // The row leads with "Todoist"; this says which list it landed in.
      subtitle: "Inbox",
      url: task.url,
      priority: PRIORITY.inbox,
      occurredAt: task.addedAt,
    },
  });

  revalidatePath("/");
  return { error: null };
}
