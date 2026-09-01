"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { discoverFeed } from "@/lib/feeds/discover";
import { generate } from "@/lib/ai";

export type FeedFormState = { error: string | null; ok: string | null; input?: string };

export async function addTopic(formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const last = await prisma.topic.findFirst({ orderBy: { position: "desc" } });

  await prisma.topic.upsert({
    where: { name },
    update: {},
    create: { name, position: (last?.position ?? -1) + 1 },
  });

  revalidatePath("/settings");
}

/**
 * Deleting a topic takes its feeds and their articles with it — the schema
 * cascades. That is deliberate: a feed with no topic has nowhere to be ranked
 * or read, so an orphan would be a row that exists and does nothing.
 */
export async function deleteTopic(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.topic.delete({ where: { id } }).catch(() => {});
  revalidatePath("/settings");
  revalidatePath("/news");
}

/**
 * Adds a feed from whatever was pasted — a site, a YouTube channel, a Steam
 * game page.
 *
 * The feed is discovered and **fetched** before the row is written, so a
 * source that does not work is never saved. The input comes back with the
 * error so a typo can be corrected rather than retyped.
 */
export async function addFeed(
  _prev: FeedFormState,
  formData: FormData,
): Promise<FeedFormState> {
  await requireAuth();

  const input = String(formData.get("input") ?? "").trim();
  const topicId = String(formData.get("topicId") ?? "");

  if (!input) return { error: null, ok: null };
  if (!topicId) return { error: "Pick a topic first.", ok: null, input };

  let found;
  try {
    found = await discoverFeed(input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read that.", ok: null, input };
  }

  const existing = await prisma.feed.findUnique({ where: { url: found.url } });
  if (existing) {
    return { error: `Already added as "${existing.title}".`, ok: null, input };
  }

  await prisma.feed.create({
    data: {
      topicId,
      url: found.url,
      input,
      title: found.title,
      kind: found.kind,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/news");
  return { error: null, ok: `Added ${found.title} — ${found.entries} items in it now.` };
}

/** Muting keeps the URL. A feed that is noisy this month may not be next. */
export async function toggleFeed(formData: FormData) {
  await requireAuth();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const feed = await prisma.feed.findUnique({ where: { id } });
  if (!feed) return;

  await prisma.feed.update({ where: { id }, data: { enabled: !feed.enabled } });
  revalidatePath("/settings");
  revalidatePath("/news");
}

export async function deleteFeed(id: string) {
  await requireAuth();
  if (!id) return;

  await prisma.feed.delete({ where: { id } }).catch(() => {});
  revalidatePath("/settings");
  revalidatePath("/news");
}

export type AiTestState = { answer: string | null; error: string | null; ms: number | null };

/**
 * One round trip to the local model, so the wire can be proved before anything
 * is built on it.
 *
 * The prompt is fixed and trivial on purpose: this answers "can Steward reach
 * the model and get words back", not "is the model any good". It also reports
 * how long it took, which is the number that decides whether a future feature
 * can be a user action or has to be a job — a 40-second round trip is fine at
 * 06:00 and unusable behind a button.
 */
export async function testAi(): Promise<AiTestState> {
  await requireAuth();

  const started = Date.now();
  try {
    const answer = await generate(
      "Reply with exactly one short sentence confirming you are running, and name yourself.",
      "You are answering a connection test from a home dashboard. Be brief. Plain text only.",
      // Short, because this is a test and a hung model should say so rather
      // than leave a spinner turning for three minutes.
      { timeoutMs: 60_000 },
    );

    if (answer === null) {
      return { answer: null, error: "No model is configured.", ms: null };
    }

    return { answer, error: null, ms: Date.now() - started };
  } catch (err) {
    return {
      answer: null,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    };
  }
}
