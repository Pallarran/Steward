import { prisma } from "@/lib/db/prisma";
import { readCollectors } from "@/lib/collectors";
import { feedName } from "@/lib/feeds/name";

/**
 * How many unread articles a single topic shows at once.
 *
 * A busy topic can hold hundreds, and a page that renders all of them is one
 * you scroll past rather than read. The rest are still there and still count;
 * they arrive as the top of the list is cleared.
 */
const PER_TOPIC = 40;

/** Two clamped lines' worth, and no more travelling to the browser. */
const DEK_CHARS = 220;

/**
 * A feed's own summary, made safe to print.
 *
 * **RSS `<description>` is routinely HTML**, and the parser stores exactly what
 * the feed said — `text()` in `lib/feeds/parse.ts` trims and nothing else. That
 * was harmless while nothing rendered it; printing it raw would put `<p>` and
 * `&amp;` on the page.
 *
 * Cleaned here rather than in the parser on purpose. The parser's job is to
 * record what arrived, and rewriting it at collection time would mean every
 * article already in Postgres stays dirty until it is re-fetched — which for a
 * read article is never.
 *
 * Deliberately crude: tags out, the five XML entities and numeric escapes back,
 * whitespace collapsed. A feed that defeats this gets a slightly odd line,
 * which is a great deal better than markup, and there is no case where a wrong
 * dek costs anything — the headline above it is the fact.
 */
export function dek(summary: string | null, title: string): string | null {
  if (!summary) return null;

  const text = summary
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  // Plenty of feeds set the description to the headline. Repeating it under
  // itself is worse than showing nothing.
  if (text.toLowerCase().startsWith(title.toLowerCase().slice(0, 60))) return null;

  return text.length > DEK_CHARS ? `${text.slice(0, DEK_CHARS).trimEnd()}…` : text;
}

export type NewsArticle = Awaited<ReturnType<typeof prisma.article.findMany>>[number] & {
  feedTitle: string;
  /** The summary, cleaned and capped. Null when the feed gave none worth showing. */
  dek: string | null;
};

export type NewsTopic = {
  id: string;
  name: string;
  unread: number;
  articles: NewsArticle[];
};

export type News = {
  topics: NewsTopic[];
  unread: number;
  /** Enabled sources. Zero is a thing Vincent has not done, not a failure. */
  feeds: number;
  collector: { asOf: Date | null; stale: boolean; configured: boolean };
};

/**
 * Just the backlog, for Home's band.
 *
 * `readNews` builds every topic with up to forty articles each and joins their
 * feeds; the band wants one integer and a boolean. This is one `count` and the
 * collector row.
 *
 * `configured` is folded into `stale` here on purpose: a band tile has no room
 * to distinguish "never set up" from "behind", and News with no feeds is a calm
 * zero rather than an amber one — so a collector that has never run reports
 * *not* stale, and the tile simply reads `0 unread`.
 */
export async function readNewsUnread(
  now: Date = new Date(),
): Promise<{ unread: number; stale: boolean }> {
  const [collectors, unread] = await Promise.all([
    readCollectors(now),
    prisma.article.count({ where: { readAt: null } }),
  ]);

  const rss = collectors.all.find((c) => c.source === "rss") ?? null;

  return { unread, stale: rss !== null && rss.stale };
}

/**
 * The News page's read.
 *
 * Unread only, newest first, grouped by topic. Per rule 3 a read article is
 * gone — this is the one place in Steward where "gone" is genuinely true and
 * final, which is why reading clears an article rather than ticking it.
 */
export async function readNews(now: Date = new Date()): Promise<News> {
  const [collectors, feeds, topics] = await Promise.all([
    readCollectors(now),
    prisma.feed.count({ where: { enabled: true } }),
    prisma.topic.findMany({ orderBy: { position: "asc" } }),
  ]);

  const rss = collectors.all.find((c) => c.source === "rss") ?? null;

  const grouped = await Promise.all(
    topics.map(async (topic) => {
      const [unread, articles] = await Promise.all([
        prisma.article.count({ where: { topicId: topic.id, readAt: null } }),
        prisma.article.findMany({
          where: { topicId: topic.id, readAt: null },
          orderBy: { publishedAt: "desc" },
          take: PER_TOPIC,
          include: { feed: { select: { title: true, url: true } } },
        }),
      ]);

      return {
        id: topic.id,
        name: topic.name,
        unread,
        articles: articles.map(({ feed, ...a }) => ({
          ...a,
          feedTitle: feedName(feed.title, feed.url),
          dek: dek(a.summary, a.title),
        })),
      };
    }),
  );

  return {
    topics: grouped.filter((t) => t.articles.length > 0),
    unread: grouped.reduce((n, t) => n + t.unread, 0),
    feeds,
    collector: {
      asOf: rss?.asOf ?? null,
      stale: rss?.stale ?? true,
      // Distinguishes "never run" from "failing": before the first run there is
      // no SourceStatus row at all, and that is not something to go amber over.
      configured: rss !== null,
    },
  };
}
