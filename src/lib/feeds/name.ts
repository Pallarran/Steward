/**
 * Titles that name a section rather than a source.
 *
 * D&D Beyond's feed is literally titled "Posts", so every article on the News
 * page read "Posts · 2 hours ago", which says nothing about where it came from.
 * Plenty of publishers do this — a feed's `<title>` is often the blog's index
 * heading rather than the site's name.
 */
const GENERIC = new Set([
  "posts",
  "post",
  "blog",
  "news",
  "feed",
  "rss",
  "atom",
  "home",
  "index",
  "updates",
  "articles",
  "latest",
  "recent",
  "stories",
]);

/**
 * What a feed is called on screen.
 *
 * Applied at render rather than when the feed is added, so it fixes sources
 * already saved and stays right if a publisher renames their feed. The stored
 * title is left alone: this is a display decision, and overwriting what the
 * publisher actually said would make the settings page lie about it.
 */
export function feedName(title: string, url: string): string {
  const trimmed = title.trim();
  if (trimmed && !GENERIC.has(trimmed.toLowerCase())) return trimmed;

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return trimmed || "Untitled feed";
  }
}
