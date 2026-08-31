import { ArrowDown, ArrowUp, Gamepad2, Globe, MonitorPlay, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feedName } from "@/lib/feeds/name";
import { readTiles } from "@/lib/launcher";
import { AddFeedForm } from "./add-feed-form";
import { AddTileForm } from "./add-tile-form";
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
      <header className="flex flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">Settings</h1>
        <p className="text-[13px] text-muted-foreground">
          Topics and sources. Add them as you find them — nothing here has to be decided in one
          sitting.
        </p>
      </header>

      <section className="flex flex-col gap-[14px] rounded-[10px] border bg-card px-[18px] py-[17px]">
        <div className="flex items-baseline justify-between gap-[12px]">
          <h2 className="text-[15px] font-semibold">Launcher tiles</h2>
          <div className="flex items-baseline gap-[10px]">
            <span className="font-mono text-[11px] text-faint">
              {tiles.length} {tiles.length === 1 ? "tile" : "tiles"}
            </span>
            {tiles.length > 0 ? (
              <form action={refreshIcons}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-faint"
                  title="Ask every service where its icon is. Anything asleep keeps the icon it has."
                >
                  Refresh icons
                </Button>
              </form>
            ) : null}
          </div>
        </div>

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
                className="flex items-center gap-[11px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover"
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
                  <button
                    type="submit"
                    disabled={i === 0}
                    aria-label={`Move ${tile.name} up`}
                    className="flex size-[22px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowUp size={14} strokeWidth={1.8} />
                  </button>
                </form>

                <form action={moveTile}>
                  <input type="hidden" name="id" value={tile.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === tiles.length - 1}
                    aria-label={`Move ${tile.name} down`}
                    className="flex size-[22px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-25"
                  >
                    <ArrowDown size={14} strokeWidth={1.8} />
                  </button>
                </form>

                <form action={deleteTile}>
                  <input type="hidden" name="id" value={tile.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${tile.name}`}
                    title="Remove"
                    className="flex size-[22px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-[14px] rounded-[10px] border bg-card px-[18px] py-[17px]">
        <h2 className="text-[15px] font-semibold">Add a source</h2>
        <AddFeedForm topics={topics.map((t) => ({ id: t.id, name: t.name }))} />
      </section>

      <section className="flex flex-col gap-[14px] rounded-[10px] border bg-card px-[18px] py-[17px]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Topics</h2>
          <span className="font-mono text-[11px] text-faint">
            {topics.reduce((n, t) => n + t.feeds.length, 0)} sources
          </span>
        </div>

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
          <div className="flex flex-col gap-[18px]">
            {topics.map((topic) => (
              <div key={topic.id} className="flex flex-col gap-[8px]">
                <div className="flex items-baseline gap-[10px]">
                  <h3 className="text-[14px] font-medium">{topic.name}</h3>
                  <span className="font-mono text-[11px] text-faint">
                    {topic.feeds.length} {topic.feeds.length === 1 ? "source" : "sources"}
                  </span>
                  <form action={deleteTopic} className="ml-auto">
                    <input type="hidden" name="id" value={topic.id} />
                    <button
                      type="submit"
                      title="Delete this topic and its sources"
                      aria-label={`Delete topic ${topic.name}`}
                      className="text-[12px] text-faint transition-colors hover:text-destructive"
                    >
                      Delete
                    </button>
                  </form>
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
                          className={`flex items-center gap-[11px] rounded-[8px] px-[10px] py-[8px] hover:bg-card-hover ${feed.enabled ? "" : "opacity-45"}`}
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

                          <form action={deleteFeed}>
                            <input type="hidden" name="id" value={feed.id} />
                            <button
                              type="submit"
                              aria-label={`Remove ${name}`}
                              title="Remove"
                              className="flex size-[22px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
                            >
                              <Trash2 size={14} strokeWidth={1.8} />
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
