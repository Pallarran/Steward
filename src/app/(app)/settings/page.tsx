import { ArrowDown, ArrowUp, Gamepad2, Globe, MonitorPlay, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feedName } from "@/lib/feeds/name";
import { readTiles } from "@/lib/launcher";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";
import { AddFeedForm } from "./add-feed-form";
import { AddTileForm } from "./add-tile-form";
import { IconButton } from "@/components/shell/icon-button";
import {
  addTopic,
  deleteFeed,
  deleteTile,
  deleteTopic,
  moveTile,
  refreshIcons,
  toggleFeed,
} from "./actions";

export const metadata = { title: "Settings · Steward" };

const KIND_ICON = { site: Globe, youtube: MonitorPlay, steam: Gamepad2 } as const;

export default async function SettingsPage() {
  await requireAuth();
  const now = new Date();

  const [topics, tiles, monitors] = await Promise.all([
    prisma.topic.findMany({
      orderBy: { position: "asc" },
      include: { feeds: { orderBy: { title: "asc" } } },
    }),
    readTiles(),
    prisma.monitor.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const groups = [...new Set(tiles.map((t) => t.group))];

  return (
    <>
      <PageHeader title="Settings" subtitle={verdict(tiles.length, topics)} />

      <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
        {/*
          Secondary rather than ghost. This is a repair control — you go looking
          for it when a tile shows its initial — and the first version was a
          faint label beside an equally faint count, which Vincent could not
          find at all. "Mark all read" on the News page stays quiet on purpose,
          because that one is a bulk action nobody should hit by accident.
          Opposite intents, opposite weights.
        */}
        <SectionHead
          title="Launcher tiles"
          detail={`${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}`}
          action={
            tiles.length > 0 ? (
              <form action={refreshIcons}>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  title="Ask every service where its icon is. Anything asleep keeps the icon it has."
                >
                  Refresh icons
                </Button>
              </form>
            ) : null
          }
        />

        <AddTileForm monitors={monitors.map((m) => m.name)} groups={groups} />

        {tiles.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing yet. Tiles are the way out to the real apps, and binding one to an Uptime Kuma
            monitor makes it carry that service&rsquo;s real status.
          </p>
        ) : (
          <ul className="flex flex-col gap-[2px]">
            {tiles.map((tile, i) => (
              <li
                key={tile.id}
                className="flex items-center gap-[10px] rounded-[8px] px-[10px] py-[8px]"
              >
                <span className="flex min-w-0 grow flex-col">
                  <span className="truncate text-[13px]">
                    {tile.name}
                    <span className="text-faint"> · {tile.group}</span>
                  </span>
                  <span className="truncate text-[12px] text-faint">
                    {tile.url}
                    {tile.monitor ? ` · watching ${tile.monitor}` : ""}
                  </span>
                </span>

                <form action={moveTile}>
                  <input type="hidden" name="id" value={tile.id} />
                  <input type="hidden" name="direction" value="up" />
                  <IconButton
                    type="submit"
                    disabled={i === 0}
                    aria-label={`Move ${tile.name} up`}
                  >
                    <ArrowUp size={14} strokeWidth={1.8} />
                  </IconButton>
                </form>

                <form action={moveTile}>
                  <input type="hidden" name="id" value={tile.id} />
                  <input type="hidden" name="direction" value="down" />
                  <IconButton
                    type="submit"
                    disabled={i === tiles.length - 1}
                    aria-label={`Move ${tile.name} down`}
                  >
                    <ArrowDown size={14} strokeWidth={1.8} />
                  </IconButton>
                </form>

                <ConfirmDialog
                  title={`Remove ${tile.name}?`}
                  description="The address, the group and the monitor it watches all go with it."
                  action={deleteTile}
                  id={tile.id}
                  done={`Removed ${tile.name}.`}
                  trigger={
                    <IconButton
                      type="button"
                      aria-label={`Remove ${tile.name}`}
                      title="Remove"
                      hover="destructive"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </IconButton>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
          <p className="text-[13px] text-muted-foreground">
            No topics yet. They are the buckets news is grouped into, and the unit the morning
            ranking works over: the best few per topic, so one noisy subject cannot drown the rest.
          </p>
        ) : (
          <div className="flex flex-col gap-[16px]">
            {topics.map((topic) => (
              <div key={topic.id} className="flex flex-col gap-[8px]">
                <div className="flex items-baseline gap-[10px]">
                  <h3 className="text-[14px] font-medium">{topic.name}</h3>
                  <span className="font-mono text-[11px] text-faint">
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
                          className="text-[12px] text-faint transition-colors hover:text-destructive"
                        >
                          Remove
                        </button>
                      }
                    />
                  </div>
                </div>

                {topic.feeds.length === 0 ? (
                  <p className="text-[12px] text-faint">Nothing in here yet.</p>
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
                            <span className="truncate text-[13px]" title={feed.url}>
                              {name}
                            </span>
                            {/*
                              Rule 2, per feed. A source that has been failing
                              for a month must say so here rather than quietly
                              making its topic look thin.
                            */}
                            {feed.lastError ? (
                              <span className="truncate text-[12px] text-warning">
                                failing{feed.lastSuccessAt ? ` for ${duration(feed.lastSuccessAt, now)}` : ""} — {feed.lastError}
                              </span>
                            ) : (
                              <span className="truncate text-[12px] text-faint">
                                {feed.articleCount} collected
                                {feed.lastSuccessAt ? ` · ${duration(feed.lastSuccessAt, now)} ago` : " · not yet fetched"}
                              </span>
                            )}
                          </span>

                          <form action={toggleFeed}>
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
    </>
  );
}

/**
 * A verdict, not a description — docs/DESIGN.md. It says what is configured, so
 * it changes when the page does.
 */
function verdict(tiles: number, topics: { feeds: unknown[] }[]): string {
  const feeds = topics.reduce((n, t) => n + t.feeds.length, 0);
  const parts = [
    `${tiles} ${tiles === 1 ? "tile" : "tiles"}`,
    `${topics.length} ${topics.length === 1 ? "topic" : "topics"}`,
    `${feeds} ${feeds === 1 ? "source" : "sources"}`,
  ];
  return parts.join(" · ");
}
