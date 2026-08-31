import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { readNews } from "@/lib/news";
import { clock, duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArticleRow } from "@/components/news/article-row";
import { markTopicRead } from "./actions";

export const metadata = { title: "News · Steward" };

const TZ = "America/Toronto";

/**
 * Where Vincent reads.
 *
 * This is the surface that makes the tour smaller — success criterion 5 — by
 * replacing visits to Ars Technica and YouTube. It shows **everything**
 * collected; the queue gets only the morning ranking, so News stays somewhere
 * you choose to go rather than somewhere you must check. PRD §3.1, amended
 * 2026-08-30.
 */
export default async function NewsPage() {
  await requireAuth();

  const now = new Date();
  const news = await readNews(now);

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">News</h1>
          <p className="text-[13px] text-muted-foreground">
            {news.unread === 0
              ? "nothing unread"
              : `${news.unread} unread across ${news.topics.length} ${news.topics.length === 1 ? "topic" : "topics"}`}
          </p>
        </div>

        {/* Rule 2. The stamp appears only when this page's own source is late. */}
        {news.collector.configured && news.collector.stale ? (
          <span className="font-mono text-[11px] text-warning">
            {news.collector.asOf
              ? `collected ${duration(news.collector.asOf, now)} ago, at ${clock(news.collector.asOf)}`
              : "never collected"}
          </span>
        ) : null}
      </header>

      {news.feeds === 0 ? (
        <Empty title="No sources yet">
          News is built from feeds you add — a site, a YouTube channel, a Steam game. Add the first
          one in <Link href="/settings" className="text-primary hover:underline">settings</Link>,
          and Steward collects them every hour.
        </Empty>
      ) : news.collector.stale ? (
        // Before congratulating anyone on an empty page, ask whether it is empty
        // because it was read or because nothing arrived.
        <Empty title="Nothing to show, and that is not good news" tone="warning">
          The collector{" "}
          {news.collector.asOf
            ? `has not succeeded since ${clock(news.collector.asOf)}, ${duration(news.collector.asOf, now)} ago`
            : "has not run yet"}
          . This page is empty because nothing arrived, not because you read it. The Systems page
          names the failure.
        </Empty>
      ) : news.topics.length === 0 ? (
        <Empty title="All read">
          Nothing unread across {news.feeds} {news.feeds === 1 ? "source" : "sources"}. The next
          collection runs on the hour.
        </Empty>
      ) : (
        news.topics.map((topic) => (
          <section
            key={topic.id}
            className="flex flex-col gap-[12px] rounded-[10px] border bg-card px-[18px] pt-[17px] pb-[10px]"
          >
            <header className="flex items-baseline justify-between gap-[12px]">
              <div className="flex items-baseline gap-[10px]">
                <h2 className="text-[15px] font-semibold">{topic.name}</h2>
                <span className="font-mono text-[11px] text-faint">
                  {topic.unread} unread
                  {topic.unread > topic.articles.length
                    ? `, ${topic.articles.length} shown`
                    : ""}
                </span>
              </div>

              <form action={markTopicRead}>
                <input type="hidden" name="topicId" value={topic.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-faint">
                  Mark all read
                </Button>
              </form>
            </header>

            <div className="flex flex-col gap-[2px]">
              {topic.articles.map((a) => (
                <ArticleRow
                  key={a.id}
                  id={a.id}
                  title={a.title}
                  url={a.url}
                  feedTitle={a.feedTitle}
                  when={when(a.publishedAt, now)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

/**
 * An entry with no usable date is stored at the epoch rather than dated "now",
 * so that an old item cannot masquerade as breaking. That has to be said here
 * too, rather than rendered as "56 years ago".
 */
function when(publishedAt: Date, now: Date): string {
  if (publishedAt.getTime() === 0) return "undated";

  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(publishedAt) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);

  if (sameDay) return clock(publishedAt);
  return `${duration(publishedAt, now)} ago`;
}

function Empty({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="flex grow flex-col items-center justify-center gap-[9px] rounded-[10px] border bg-card py-[64px] text-center">
      <p className={`text-[17px] font-semibold ${tone === "warning" ? "text-warning" : ""}`}>
        {title}
      </p>
      <p className="max-w-[440px] text-[13px] leading-[1.6] text-muted-foreground">{children}</p>
    </div>
  );
}
