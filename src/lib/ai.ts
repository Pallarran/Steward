import { request } from "@/lib/adapters/http";

/**
 * The local model, over Ollama's HTTP API.
 *
 * **This is not an adapter, and must never become one.** It writes no
 * `SourceStatus`, appears on no collector grid, and has no staleness — the same
 * category as `lib/paperless.ts`, and a deliberate, named exception to
 * `docs/ARCHITECTURE.md` rule 1 for the same three reasons:
 *
 * - Every call is **user-initiated or job-initiated**, never part of a render.
 *   No page may await a model: a 12B model on CPU takes tens of seconds, and a
 *   page that waits for one is a page that does not load.
 * - It returns **generated text, never state**. Nothing from here is shown as
 *   current, so there is nothing for the staleness rule to protect. Anything
 *   worth keeping is written to the database and read back like everything
 *   else.
 * - A failure is a message inside one section and cannot touch anything else.
 *
 * **Unset means not connected, not failing.** Chronicle defaults its URL to
 * `localhost:11434`, so an unconfigured install reads as broken rather than as
 * absent; Steward follows its own convention here — Horizon and Paperless both
 * distinguish "never set up" from "set up and not answering", and the UI must
 * say which.
 *
 * The shape is taken from The Adventurer's Chronicle's `lib/ai.ts`, which is
 * proven against Vincent's own Ollama. What is added: a timeout on generation
 * (Chronicle has one on the health check and none on the call that actually
 * takes minutes), the configured/failing distinction, and `request` so a
 * refused connection names ECONNREFUSED rather than "fetch failed".
 */

/** Generation. Deliberately generous: a local model is slow, not broken. */
const GENERATE_TIMEOUT_MS = 180_000;

/** The health check, which must stay fast enough to sit in a page action. */
const CHECK_TIMEOUT_MS = 5_000;

/**
 * How long Ollama keeps the model in memory after a call.
 *
 * **Measured on WhiteTower, 2026-09-01, `gemma3:12b`: 27.5s cold, 1.4s warm.**
 * Effectively all of that is loading an 8.1 GB file; the generation itself is
 * interactive. So the only thing standing between this and a usable button is
 * whether the model is still resident when the button is pressed, and Ollama's
 * own default evicts it after five minutes.
 *
 * Fifteen minutes, not "forever". Keeping it pinned would hold 8 GB of
 * WhiteTower's RAM away from the array cache and everything else on the box,
 * permanently, to save 26 seconds on the first use of a feature. Fifteen covers
 * a working session — triaging a morning's mail over ten minutes stays warm
 * throughout — and gives the memory back afterwards.
 *
 * A scheduled job does not care either way: it pays the load once and nobody is
 * watching.
 */
const KEEP_ALIVE = "15m";

export type AiStatus = {
  /** Both env vars set. False means never configured — never render as failing. */
  configured: boolean;
  /** Ollama answered. */
  connected: boolean;
  /** Empty when not configured, so the UI can name what to set. */
  url: string;
  model: string;
  /** The configured model is actually pulled. Connected but false is fixable. */
  modelAvailable: boolean;
  /** What is pulled, for when the configured one is not. */
  models: string[];
  /** Why it did not answer, already readable. Null when it did. */
  error: string | null;
};

export function aiConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);
}

/** The configured model, for copy that needs to name it. */
export function aiModel(): string {
  return process.env.OLLAMA_MODEL ?? "";
}

type GenerateResponse = { response?: string; done?: boolean };
type TagsResponse = { models?: { name: string }[] };

/**
 * One completion, no streaming.
 *
 * Throws rather than returning null on failure: every caller is an action or a
 * job that has somewhere to put a message, and a silent empty string would be
 * indistinguishable from a model that had nothing to say.
 *
 * Returns null **only** when nothing is configured, which the caller renders as
 * "not connected" rather than as an empty answer — the same contract as
 * `searchDocuments`.
 */
export async function generate(
  prompt: string,
  system: string,
  {
    timeoutMs = GENERATE_TIMEOUT_MS,
    /**
     * A hard stop on how much the model may write, as Ollama's `num_predict`.
     *
     * **A prompt is a request; this is a limit.** "At most three short lines"
     * held on ordinary mail and was ignored outright on a long one, which
     * overflowed the dialog it was rendered in. Capping tokens also bounds the
     * *time*: a model asked for two hundred tokens cannot spend a minute on a
     * message, however long the message is.
     */
    maxTokens,
  }: { timeoutMs?: number; maxTokens?: number } = {},
): Promise<string | null> {
  const base = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!base || !model) return null;

  if (!prompt.trim()) throw new Error("Nothing to send.");

  const response = await request(new URL("/api/generate", base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system,
      stream: false,
      keep_alive: KEEP_ALIVE,
      ...(maxTokens ? { options: { num_predict: maxTokens } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (response.status === 404) {
    // Ollama's own 404 for a model it does not hold. Worth its own message:
    // the fix is one `ollama pull`, not a configuration change.
    throw new Error(`Ollama does not have ${model} — run: ollama pull ${model}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama answered ${response.status} ${response.statusText}. ${body}`.trim());
  }

  const body = (await response.json()) as GenerateResponse;
  const text = (body.response ?? "").trim();
  if (!text) throw new Error("Ollama answered with nothing.");

  return text;
}

/**
 * Whether the model is reachable, and whether it is the one asked for.
 *
 * Never throws — this is rendered as a status, and a status that can crash the
 * page it is on is worse than one that says "not answering".
 */
export async function checkAi(): Promise<AiStatus> {
  const base = process.env.OLLAMA_BASE_URL ?? "";
  const model = process.env.OLLAMA_MODEL ?? "";

  const status: AiStatus = {
    configured: Boolean(base && model),
    connected: false,
    url: base,
    model,
    modelAvailable: false,
    models: [],
    error: null,
  };

  if (!status.configured) return status;

  try {
    const response = await request(new URL("/api/tags", base), {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      status.error = `answered ${response.status} ${response.statusText}`;
      return status;
    }

    const body = (await response.json()) as TagsResponse;
    status.connected = true;
    status.models = (body.models ?? []).map((m) => m.name).sort();
    status.modelAvailable = holdsModel(status.models, model);
    return status;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
    return status;
  }
}

/**
 * Whether a pulled model satisfies the configured name.
 *
 * Ollama's tags are always `family:tag`, so `gemma3` is configured but never
 * listed — an exact match alone would report a model that is right there as
 * missing, and send Vincent to pull something he already has.
 */
export function holdsModel(pulled: string[], wanted: string): boolean {
  return pulled.some((name) => name === wanted || name.startsWith(`${wanted}:`));
}
