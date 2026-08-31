import Link from "next/link";
import { Check, Rss, TriangleAlert } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";
import { readNews } from "@/lib/news";
import { clock, duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArticleRow } from "@/components/news/article-row";
import { markTopicRead, undoTopicRead } from "./actions";

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
export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();

  const now = new Date();
  const [news, params] = await Promise.all([readNews(now), searchParams]);

  const cleared = Number(one(params.cleared));
  const undo =
    Number.isFinite(cleared) && cleared > 0 && one(params.at) && one(params.topic)
      ? { count: cleared, at: one(params.at)!, topic: one(params.topic)! }
      : null;

  return (
    <>
      <PageHeader
        title="News"
        subtitle={
          news.unread === 0
            ? "nothing unread"
            : `${news.unread} unread across ${news.topics.length} ${news.topics.length === 1 ? "topic" : "topics"}`
        }
        // Rule 2: the stamp appears only when this page's own source is late.
        action={
          news.collector.configured && news.collector.stale ? (
            <span className="font-mono text-[11px] text-warning">
              {news.collector.asOf
                ? `collected ${duration(news.collector.asOf, now)} ago, at ${clock(news.collector.asOf)}`
                : "never collected"}
            </span>
          ) : null
        }
      />

      {/*
        The undo bar. It is what makes "Mark all read" pressable: the batch
        carries one shared `readAt`, so putting it back restores exactly what
        that click cleared and nothing else.
      */}
      {undo ? (
        <div className="flex items-center justify-between gap-[12px] rounded-[10px] border border-primary/40 bg-card px-[16px] py-[10px]">
          <span className="text-[13px]">
            {undo.count} {undo.count === 1 ? "article" : "articles"} marked read.
          </span>
          <form action={undoTopicRead}>
            <input type="hidden" name="topicId" value={undo.topic} />
            <input type="hidden" name="at" value={undo.at} />
            <Button type="submit" variant="secondary" size="sm">
              Undo
            </Button>
          </form>
        </div>
      ) : null}

      {news.feeds === 0 ? (
        <EmptyState icon={Rss} accent="var(--blue)" title="No sources yet" description={<>
          News is built from feeds you add — a site, a YouTube channel, a Steam game. Add the first
          one in <Link href="/settings" className="text-primary hover:underline">settings</Link>,
          and Steward collects them every hour.
        </>} />
      ) : news.collector.stale ? (
        // Before congratulating anyone on an empty page, ask whether it is empty
        // because it was read or because nothing arrived.
        <EmptyState icon={TriangleAlert} tone="warning" title="Nothing to show, and that is not good news" description={<>
          The collector{" "}
          {news.collector.asOf
            ? `has not succeeded since ${clock(news.collector.asOf)}, ${duration(news.collector.asOf, now)} ago`
            : "has not run yet"}
          . This page is empty because nothing arrived, not because you read it. The Systems page
          names the failure.
        </>} />
      ) : news.topics.length === 0 ? (
        <EmptyState icon={Check} accent="var(--teal)" title="All read" description={<>
          Nothing unread across {news.feeds} {news.feeds === 1 ? "source" : "sources"}. The next
          collection runs on the hour.
        </>} />
      ) : (
        news.topics.map((topic) => (
          <Panel
            as="section"
            pad="lg"
            key={topic.id}
            className="flex flex-col gap-[12px] pb-[10px]"
          >
            {/* The count sat beside the topic name here and on the right
                everywhere else. Right, like everywhere else. */}
            <SectionHead
              as="header"
              title={topic.name}
              detail={`${topic.unread} unread${
                topic.unread > topic.articles.length ? `, ${topic.articles.length} shown` : ""
              }`}
              action={
                <form action={markTopicRead}>
                  <input type="hidden" name="topicId" value={topic.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-faint">
                    Mark all read
                  </Button>
                </form>
              }
            />

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
          </Panel>
        ))
      )}
    </>
  );
}

/** A query parameter can arrive repeated; only the first is meaningful here. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

