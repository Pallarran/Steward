import { ChevronDown, ChevronUp, Gamepad2, Globe, MonitorPlay, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { duration } from "@/lib/format";
import { feedName } from "@/lib/feeds/name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { IconButton } from "@/components/shell/icon-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shell/empty-state";
import { AddFeedForm } from "./add-feed-form";
import { TopicName } from "./topic-name";
import { addTopic, deleteFeed, deleteTopic, moveTopic, toggleFeed } from "@/app/(app)/news/actions";

const KIND_ICON = { site: Globe, youtube: MonitorPlay, steam: Gamepad2 } as const;

/**
 * Where news comes from, on the page that shows it.
 *
 * **Moved off `/settings` on 2026-09-04**, and it is the third application of a
 * rule `docs/DESIGN.md` states twice: *the controls that create, edit and
 * arrange a thing live on the page that shows it*. Subscriptions went to
 * Finance and launcher tiles went to the Launcher on 2026-09-01; this was the
 * one left, and `/settings`' own comment said so — *"a page called Settings
 * that manages news feeds is an odd shape, and by the same argument those
 * sources probably belong on `/news`"*.
 *
 * It sits at the foot of the page rather than the head, because reading is what
 * `/news` is for and adding a source happens a few times a year. Same order as
 * Finance: the thing you came for, then the thing you occasionally manage.
 *
 * Three columns at full width. It was a stack of full-width blocks costing
 * about 1,700px for five topics of five feeds, which put the local model's
 * health check below every feed Vincent owns.
 */
export async function Sources() {
  const now = new Date();

  const topics = await prisma.topic.findMany({
    orderBy: { position: "asc" },
    include: { feeds: { orderBy: { title: "asc" } } },
  });

  const feeds = topics.reduce((n, t) => n + t.feeds.length, 0);

  return (
    <Section
      title="Sources"
      detail={`${topics.length} ${topics.length === 1 ? "topic" : "topics"} · ${feeds} ${feeds === 1 ? "source" : "sources"}`}
    >
      <Panel pad="lg" className="flex flex-col gap-[16px]">
        <AddFeedForm topics={topics.map((t) => ({ id: t.id, name: t.name }))} />

        <form action={addTopic} className="flex items-center gap-[8px]">
          <Input
            name="name"
            required
            placeholder="New topic — homelab, D&amp;D, Québec…"
            className="grow"
          />
          <Button type="submit" variant="secondary">
            Add topic
          </Button>
        </form>

        {topics.length === 0 ? (
          // A collection with nothing in it, so `EmptyState` rather than a grey
          // paragraph — and it names what a topic is for, since nothing else on
          // the page can explain the ranking that has not been built yet.
          <EmptyState
            icon={Globe}
            accent="var(--blue)"
            title="No topics yet"
            description="Topics are the buckets news is grouped into, and the unit the morning ranking works over: the best few per topic, so one noisy subject cannot drown the rest."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-[16px]">
            {topics.map((topic, i) => (
              <div key={topic.id} className="flex flex-col gap-[6px]">
                <div className="flex items-baseline gap-[8px]">
                  <TopicName id={topic.id} name={topic.name} />

                  <span className="shrink-0 font-mono text-[12px] text-faint">
                    {topic.feeds.length}
                  </span>

                  <span className="ml-auto flex shrink-0 items-center gap-[2px]">
                    {/* Offered only where it can do something. A disabled
                        control at each end would be two thirds of the buttons
                        on a three-topic page doing nothing. */}
                    {i > 0 ? <Move id={topic.id} direction="up" name={topic.name} /> : null}
                    {i < topics.length - 1 ? (
                      <Move id={topic.id} direction="down" name={topic.name} />
                    ) : null}

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
                        <IconButton
                          type="button"
                          aria-label={`Remove topic ${topic.name}`}
                          title="Remove this topic"
                          hover="destructive"
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                        </IconButton>
                      }
                    />
                  </span>
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
                          className={`flex items-center gap-[8px] rounded-[8px] px-[8px] py-[6px] ${feed.enabled ? "" : "opacity-45"}`}
                        >
                          <Icon size={14} strokeWidth={1.8} className="shrink-0 text-faint" />

                          <span className="flex min-w-0 grow flex-col">
                            {/* `feed.input` is what Vincent actually pasted, and
                                the schema comment says it is "kept so the
                                settings page can show it" — which it never did.
                                It is the hover, because the resolved name is the
                                better line and the pasted address is what you
                                need when you cannot recognise it. */}
                            <span className="truncate text-[14px]" title={feed.input || feed.url}>
                              {name}
                            </span>

                            {/*
                              Rule 2, per feed. A source failing for a month must
                              say so here rather than quietly making its topic
                              look thin.

                              `lastFetchedAt` as well as `lastSuccessAt` from
                              2026-09-04: without it, "tried four minutes ago and
                              failed" and "has not been tried since Tuesday" were
                              the same sentence.
                            */}
                            {feed.lastError ? (
                              <span className="truncate text-[12px] text-warning">
                                failing
                                {feed.lastFetchedAt
                                  ? `, last tried ${duration(feed.lastFetchedAt, now)} ago`
                                  : ""}{" "}
                                — {feed.lastError}
                              </span>
                            ) : (
                              <span className="truncate font-mono text-[12px] text-faint">
                                {feed.articleCount}
                                {feed.lastSuccessAt
                                  ? ` · ${duration(feed.lastSuccessAt, now)} ago`
                                  : " · not yet fetched"}
                              </span>
                            )}
                          </span>

                          <form action={toggleFeed} className="shrink-0">
                            <input type="hidden" name="id" value={feed.id} />
                            <button
                              type="submit"
                              className="text-[12px] text-faint transition-colors hover:text-foreground"
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
                                <Trash2 size={13} strokeWidth={1.8} />
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
    </Section>
  );
}

/** One step up or down. `moveTopic` swaps with the neighbour. */
function Move({ id, direction, name }: { id: string; direction: "up" | "down"; name: string }) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;

  return (
    <form action={moveTopic}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <IconButton type="submit" aria-label={`Move ${name} ${direction}`} title={`Move ${direction}`}>
        <Icon size={14} strokeWidth={1.8} />
      </IconButton>
    </form>
  );
}
