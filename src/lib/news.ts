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

export type NewsArticle = Awaited<ReturnType<typeof prisma.article.findMany>>[number] & {
  feedTitle: string;
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
