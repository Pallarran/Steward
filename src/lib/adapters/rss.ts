import { prisma } from "@/lib/db/prisma";
import { parseFeed } from "@/lib/feeds/parse";
import { request } from "./http";
import type { Adapter } from "./types";

const TIMEOUT_MS = 20_000;
const UA = "Steward/1.0 (personal dashboard; one reader)";

type FeedRow = Awaited<ReturnType<typeof prisma.feed.findMany>>[number];

/**
 * The RSS collector.
 *
 * Reads every enabled `Feed` into the `Article` staging pool. Nothing here
 * touches the queue: PRD §3.1 — the queue gets curated output, never raw feeds,
 * and a dozen sources produce hundreds of items a day. The 06:00 ranking is
 * what promotes a handful of these into it.
 *
 * **Conditional requests, unlike Uptime Kuma's metrics.** A feed body genuinely
 * is byte-identical between polls when nothing has been published, so `ETag`
 * and `If-Modified-Since` earn their keep here in a way they could not there.
 * `docs/ARCHITECTURE.md` rule 6.
 */
export const rssAdapter: Adapter = {
  key: "rss",
  intervalSeconds: 3600,

  async run(now) {
    const feeds = await prisma.feed.findMany({
      where: { enabled: true },
      orderBy: { title: "asc" },
    });

    // Not an error. An empty source list is a thing Vincent has not done yet,
    // and the News page says so in words rather than going amber.
    if (feeds.length === 0) return "no sources yet";

    let succeeded = 0;
    let unchanged = 0;
    let added = 0;
    const failing: string[] = [];

    for (const feed of feeds) {
      try {
        const result = await collect(feed, now);
        succeeded++;
        if (result.unchanged) unchanged++;
        added += result.added;
      } catch (err) {
        // Rule 1's isolation, one level deeper than the scheduler provides.
        // One feed 404ing must not take the other twenty down with it — and it
        // must say so itself, on the settings page, rather than quietly making
        // its topic look thin.
        failing.push(feed.title);
        await prisma.feed.update({
          where: { id: feed.id },
          data: {
            lastFetchedAt: now,
            lastError: err instanceof Error ? err.message : "Could not read that feed",
          },
        });
      }
    }

    // The source only goes amber when not one feed could be read, because that
    // is the only case where the failure is Steward's rather than a publisher's.
    if (succeeded === 0) {
      throw new Error(`No source could be read. ${failing.length} failing: ${failing.join(", ")}`);
    }

    return (
      `${feeds.length} feeds, ${unchanged} unchanged, ${added} new articles` +
      (failing.length > 0 ? `, ${failing.length} failing: ${failing.join(", ")}` : "")
    );
  },
};

async function collect(feed: FeedRow, now: Date): Promise<{ unchanged: boolean; added: number }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  };
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

  const response = await request(feed.url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
    cache: "no-store",
  });

  // Nothing published since last time. This is a success, and it is the whole
  // point of sending the two headers above.
  if (response.status === 304) {
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastFetchedAt: now, lastSuccessAt: now, lastError: null },
    });
    return { unchanged: true, added: 0 };
  }

  if (!response.ok) {
    throw new Error(`answered ${response.status} ${response.statusText}`);
  }

  // Throws when the body is not a feed at all, which is how a publisher who
  // has replaced their feed with an HTML error page gets noticed.
  const parsed = parseFeed(await response.text());

  // One insert for the whole batch, skipping what is already held.
  //
  // Deliberately **not** an upsert: an upsert would rewrite every existing row
  // every hour, on every feed, to change nothing. The cost is that a headline
  // edited after publication keeps its original wording here, which is a fair
  // trade for an hourly job across dozens of sources — and `readAt` and
  // `promotedAt` are untouchable by construction rather than by remembering.
  const created = await prisma.article.createMany({
    skipDuplicates: true,
    data: parsed.entries.map((e) => ({
      feedId: feed.id,
      topicId: feed.topicId,
      externalId: e.externalId,
      title: e.title,
      url: e.url,
      summary: e.summary,
      author: e.author,
      publishedAt: e.publishedAt,
    })),
  });

  const articleCount = await prisma.article.count({ where: { feedId: feed.id } });

  await prisma.feed.update({
    where: { id: feed.id },
    data: {
      lastFetchedAt: now,
      lastSuccessAt: now,
      lastError: null,
      // Stored for the next run. A publisher who sends neither leaves both
      // null, and the feed is simply fetched in full each time.
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      articleCount,
    },
  });

  return { unchanged: false, added: created.count };
}
