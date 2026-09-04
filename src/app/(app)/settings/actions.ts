"use server";

import { requireAuth } from "@/lib/auth/require-auth";
import { generate } from "@/lib/ai";

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
