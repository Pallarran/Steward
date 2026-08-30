/**
 * fetch, with an error message worth reading.
 *
 * Node's fetch throws a bare `fetch failed` and buries the real reason —
 * ECONNREFUSED, ENOTFOUND, a DNS miss, a timeout — inside `err.cause`. A
 * collector's error is not just a log line: it is what the amber panel shows
 * Vincent, and rule 2 says a stale panel must **name** what went wrong. "fetch
 * failed" names nothing.
 *
 * This cost a deploy to learn. Home Assistant was configured as
 * `homeassistant.local`, which resolves over mDNS on a desktop and not at all
 * inside a container; the panel said "fetch failed" and the actual answer,
 * ENOTFOUND, was one level down in the cause chain.
 */
export async function request(url: string | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Error(`Could not reach ${hostOf(url)}: ${reasonFor(err)}`);
  }
}

function hostOf(url: string | URL): string {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
}

function reasonFor(err: unknown): string {
  // AbortSignal.timeout() rejects with a TimeoutError rather than a cause.
  if (err instanceof Error && err.name === "TimeoutError") return "timed out";

  const cause = err instanceof Error ? err.cause : null;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    return code ? `${code} (${cause.message})` : cause.message;
  }

  return err instanceof Error ? err.message : String(err);
}
