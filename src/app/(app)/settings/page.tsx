import { Gamepad2, Globe, MonitorPlay, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feedName } from "@/lib/feeds/name";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";
import { AddFeedForm } from "./add-feed-form";
import { AiTest } from "./ai-test";
import { checkAi } from "@/lib/ai";
import { Dot } from "@/components/shell/dot";
import { IconButton } from "@/components/shell/icon-button";
import { addTopic, deleteFeed, deleteTopic, toggleFeed } from "./actions";

export const metadata = { title: "Settings · Steward" };

const KIND_ICON = { site: Globe, youtube: MonitorPlay, steam: Gamepad2 } as const;

export default async function SettingsPage() {
  await requireAuth();
  const now = new Date();

  const topics = await prisma.topic.findMany({
    orderBy: { position: "asc" },
    include: { feeds: { orderBy: { title: "asc" } } },
  });

  return (
    <>
      <PageHeader title="Settings" subtitle={verdict(topics)} />

      <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
        <SectionHead title="Add a source" />
        <AddFeedForm topics={topics.map((t) => ({ id: t.id, name: t.name }))} />
      </Panel>

      <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
        <SectionHead
          title="Topics"
          detail={`${topics.reduce((n, t) => n + t.feeds.length, 0)} sources`}
        />

        <form action={addTopic} className="flex items-center gap-[8px]">
          <Input name="name" required placeholder="New topic — homelab, D&D, Québec…" className="grow" />
          <Button type="submit" variant="secondary">
            Add topic
          </Button>
        </form>

        {topics.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            No topics yet. They are the buckets news is grouped into, and the unit the morning
            ranking works over: the best few per topic, so one noisy subject cannot drown the rest.
          </p>
        ) : (
          <div className="flex flex-col gap-[16px]">
            {topics.map((topic) => (
              <div key={topic.id} className="flex flex-col gap-[8px]">
                <div className="flex items-baseline gap-[10px]">
                  <h3 className="text-[15px] font-medium">{topic.name}</h3>
                  <span className="font-mono text-[12px] text-faint">
                    {topic.feeds.length} {topic.feeds.length === 1 ? "source" : "sources"}
                  </span>
                  <div className="ml-auto">
                    <ConfirmDialog
                      title={`Remove the ${topic.name} topic?`}
                      description={
                        topic.feeds.length > 0
                          ? `Its ${topic.feeds.length} ${topic.feeds.length === 1 ? "source goes" : "sources go"} with it, and every article they have collected. Nothing re-fetches what is already gone.`
                          : "It has no sources, so nothing else goes with it."
                      }
                      action={deleteTopic}
                      id={topic.id}
                      done={`Removed ${topic.name}.`}
                      trigger={
                        <button
                          type="button"
                          aria-label={`Remove topic ${topic.name}`}
                          className="text-[13px] text-faint transition-colors hover:text-destructive"
                        >
                          Remove
                        </button>
                      }
                    />
                  </div>
                </div>

                {topic.feeds.length === 0 ? (
                  <p className="text-[13px] text-faint">Nothing in here yet.</p>
                ) : (
                  <ul className="flex flex-col gap-[2px]">
                    {topic.feeds.map((feed) => {
                      const Icon = KIND_ICON[feed.kind];
                      const name = feedName(feed.title, feed.url);
                      return (
                        <li
                          key={feed.id}
                          className={`flex items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] ${feed.enabled ? "" : "opacity-45"}`}
                        >
                          <Icon size={15} strokeWidth={1.8} className="shrink-0 text-faint" />

                          <span className="flex min-w-0 grow flex-col">
                            <span className="truncate text-[14px]" title={feed.url}>
                              {name}
                            </span>
                            {/*
                              Rule 2, per feed. A source that has been failing
                              for a month must say so here rather than quietly
                              making its topic look thin.
                            */}
                            {feed.lastError ? (
                              <span className="truncate text-[13px] text-warning">
                                failing{feed.lastSuccessAt ? ` for ${duration(feed.lastSuccessAt, now)}` : ""} — {feed.lastError}
                              </span>
                            ) : (
                              <span className="truncate text-[13px] text-faint">
                                {feed.articleCount} collected
                                {feed.lastSuccessAt ? ` · ${duration(feed.lastSuccessAt, now)} ago` : " · not yet fetched"}
                              </span>
                            )}
                          </span>

                          <form action={toggleFeed}>
                            <input type="hidden" name="id" value={feed.id} />
                            <button
                              type="submit"
                              className="text-[13px] text-faint transition-colors hover:text-foreground"
                              title={feed.enabled ? "Mute — keeps the address" : "Unmute"}
                            >
                              {feed.enabled ? "Mute" : "Unmute"}
                            </button>
                          </form>

                          <ConfirmDialog
                            title={`Remove ${name}?`}
                            description={`Its ${feed.articleCount} collected ${feed.articleCount === 1 ? "article goes" : "articles go"} too. Muting keeps the address and stops the collecting, if that is what you meant.`}
                            action={deleteFeed}
                            id={feed.id}
                            done={`Removed ${name}.`}
                            trigger={
                              <IconButton
                                type="button"
                                aria-label={`Remove ${name}`}
                                title="Remove"
                                hover="destructive"
                              >
                                <Trash2 size={14} strokeWidth={1.8} />
                              </IconButton>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <AiSection />
    </>
  );
}

/**
 * The local model.
 *
 * On Settings rather than Systems on purpose: `/systems` is the collectors and
 * the machines, and everything on it carries an "as of" and a staleness rule.
 * The model is neither — nothing polls it, nothing goes stale, and putting it
 * in that grid would promise a freshness it does not have. It sits here beside
 * the other thing Vincent configures with an env var and then forgets.
 *
 * Three states, said differently, because they need different things doing:
 * not configured is an instruction, not answering is a fault, and answering
 * without the model pulled is one command away from working.
 */
async function AiSection() {
  const ai = await checkAi();

  return (
    <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
      <SectionHead
        title="Local model"
        detail={ai.configured ? ai.model : undefined}
        action={
          ai.configured ? (
            <Dot tone={ai.connected ? (ai.modelAvailable ? "ok" : "stale") : "down"} size={9} ring />
          ) : null
        }
      />

      {!ai.configured ? (
        <p className="text-[14px] text-muted-foreground">
          Not connected. Set <code className="font-mono text-[13px]">OLLAMA_BASE_URL</code> and{" "}
          <code className="font-mono text-[13px]">OLLAMA_MODEL</code> in{" "}
          <code className="font-mono text-[13px]">.env</code> on WhiteTower, then rebuild.
        </p>
      ) : !ai.connected ? (
        <p className="text-[14px]" style={{ color: "var(--warning)" }}>
          {ai.url} is not answering{ai.error ? ` — ${ai.error}` : ""}.
        </p>
      ) : !ai.modelAvailable ? (
        <p className="text-[14px]" style={{ color: "var(--warning)" }}>
          Answering, but {ai.model} is not pulled. Run{" "}
          <code className="font-mono text-[13px]">ollama pull {ai.model}</code>.
          {ai.models.length > 0 ? ` It holds ${ai.models.join(", ")}.` : ""}
        </p>
      ) : (
        <p className="text-[14px] text-muted-foreground">
          {ai.model} is loaded and answering at {ai.url}.
        </p>
      )}

      {/* Nothing reads the model yet — this exists so the connection can be
          proved before Gmail or the news ranking is built on top of it. */}
      <AiTest disabled={!ai.configured} />
    </Panel>
  );
}

/**
 * A verdict, not a description — docs/DESIGN.md. It says what is configured, so
 * it changes when the page does.
 */
/**
 * News only, since the launcher tiles moved to their own page on 2026-09-01.
 *
 * A page called Settings that manages news feeds is an odd shape, and by the
 * same argument that moved the tiles those sources probably belong on `/news`.
 * That is a separate decision and this is not it.
 */
function verdict(topics: { feeds: unknown[] }[]): string {
  const feeds = topics.reduce((n, t) => n + t.feeds.length, 0);
  return [
    `${topics.length} ${topics.length === 1 ? "topic" : "topics"}`,
    `${feeds} ${feeds === 1 ? "source" : "sources"}`,
  ].join(" · ");
}
