import { request } from "@/lib/adapters/http";
import { parseFeed } from "./parse";
import type { FeedKind } from "@/generated/prisma/enums";

const TIMEOUT_MS = 15_000;
const UA = "Steward/1.0 (personal dashboard; one reader)";

export type Discovered = {
  url: string;
  title: string;
  kind: FeedKind;
  /** How many entries the validating fetch actually returned. */
  entries: number;
};

async function get(url: string) {
  return request(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
}

/** Accepts "arstechnica.com" as readily as a full URL. */
function normalize(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Turns whatever Vincent pasted into a feed URL, then proves it is one.
 *
 * The point is that he never has to hunt for an RSS link, work out YouTube's
 * feed format, or find a Steam appid. Paste the page you read; Steward does
 * the rest — and **fetches the result before saving it**, so a feed that does
 * not work is never added and he finds out now rather than by noticing that
 * nothing ever arrives.
 */
export async function discoverFeed(input: string): Promise<Discovered> {
  const url = normalize(input);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That does not look like a web address");
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) {
    return validate(await youtubeFeed(parsed), "youtube");
  }
  if (host === "store.steampowered.com" || host === "steamcommunity.com") {
    return validate(steamFeed(parsed), "steam");
  }
  return validate(await siteFeed(url), "site");
}

/** `/feeds/videos.xml?channel_id=UC…`, which needs the id, not the handle. */
async function youtubeFeed(parsed: URL): Promise<string> {
  const direct = parsed.pathname.match(/\/channel\/(UC[\w-]+)/);
  if (direct) return channelFeed(direct[1]);

  // A handle, a legacy /c/ name or a video page: the channel id is in the HTML.
  const response = await get(parsed.toString());
  if (!response.ok) throw new Error(`YouTube answered ${response.status}`);
  const html = await response.text();

  // Only sources that identify *this* page's channel. A bare `channel/UC…`
  // match anywhere in the HTML finds recommended and related channels too:
  // asking for @Level1Techs returned "Level1Links With Friends" that way,
  // which is worse than failing, because it is wrong and looks fine.
  const found =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/channel\/(UC[\w-]+)/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["'][^"']*\/channel\/(UC[\w-]+)/i)?.[1] ??
    html.match(/"externalChannelId":"(UC[\w-]+)"/)?.[1];

  if (!found) {
    throw new Error(
      "Could not identify that channel. Open the channel page, copy the URL that contains /channel/UC…, and paste that instead",
    );
  }
  return channelFeed(found);
}

function channelFeed(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/** Steam publishes per-game news at a URL built from the appid. */
function steamFeed(parsed: URL): string {
  const appid = parsed.pathname.match(/\/app\/(\d+)/)?.[1];
  if (!appid) throw new Error("Could not find a Steam app id in that link");
  return `https://store.steampowered.com/feeds/news/app/${appid}/?cc=CA&l=english`;
}

/**
 * The pasted URL is either already a feed, or an HTML page that advertises one
 * in a `<link rel="alternate">`.
 */
async function siteFeed(url: string): Promise<string> {
  const response = await get(url);
  if (!response.ok) throw new Error(`That address answered ${response.status}`);

  const body = await response.text();
  const type = response.headers.get("content-type") ?? "";

  // Already a feed.
  if (/xml/i.test(type) || /^\s*<(\?xml|rss|feed)/i.test(body)) return response.url || url;

  const links = [...body.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of links) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) return new URL(href, response.url || url).toString();
  }

  // Plenty of sites publish a feed without advertising it — Ars Technica
  // among them. Try where feeds conventionally live before giving up.
  for (const path of ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml"]) {
    const candidate = new URL(path, response.url || url).toString();
    try {
      const guess = await get(candidate);
      if (!guess.ok) continue;
      const text = await guess.text();
      parseFeed(text);
      return guess.url || candidate;
    } catch {
      // Wrong guess. Try the next one rather than reporting it: none of these
      // failures is the answer Vincent needs.
    }
  }

  throw new Error("That page does not advertise a feed, and none of the usual paths worked");
}

/** The step that makes the difference: fetch it and prove it parses. */
async function validate(feedUrl: string, kind: FeedKind): Promise<Discovered> {
  const response = await get(feedUrl);
  if (!response.ok) throw new Error(`The feed answered ${response.status}`);

  const feed = parseFeed(await response.text());

  // A feed with no entries might be new, or might be a wrong guess that
  // happens to be valid XML. Either way there is nothing to show, and adding
  // it would make its topic look thin for reasons nobody could see.
  if (feed.entries.length === 0) throw new Error("That feed is valid but empty");

  return {
    url: feedUrl,
    title: await titleFor(feed.title, feedUrl, kind),
    kind,
    entries: feed.entries.length,
  };
}

/**
 * Steam titles its per-game feed "1086940 RSS Feed", which is no use in a list.
 * The store API knows the name, so ask it — and fall back to the feed's own
 * title rather than failing the whole add over a cosmetic detail.
 */
async function titleFor(feedTitle: string, feedUrl: string, kind: FeedKind): Promise<string> {
  if (kind !== "steam") return feedTitle;

  const appid = feedUrl.match(/\/app\/(\d+)/)?.[1];
  if (!appid) return feedTitle;

  try {
    const response = await get(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
    if (!response.ok) return feedTitle;
    const body = (await response.json()) as Record<string, { success?: boolean; data?: { name?: string } }>;
    return body[appid]?.data?.name ?? feedTitle;
  } catch {
    return feedTitle;
  }
}
