import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/feeds/parse";
import { feedName } from "@/lib/feeds/name";

describe("parseFeed, RSS", () => {
  const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Ars Technica</title>
    <item>
      <title><![CDATA[A headline with <em>markup</em> in it]]></title>
      <link>https://arstechnica.com/one</link>
      <guid isPermaLink="false">ars-1</guid>
      <description>The standfirst.</description>
      <dc:creator>A Writer</dc:creator>
      <pubDate>Sat, 30 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>No guid, no date</title>
      <link>https://arstechnica.com/two</link>
    </item>
    <item>
      <title>No link at all</title>
    </item>
  </channel>
</rss>`;

  it("reads titles out of CDATA", () => {
    expect(parseFeed(rss).entries[0].title).toBe("A headline with <em>markup</em> in it");
  });

  it("prefers the guid as the external id, and falls back to the url", () => {
    const [first, second] = parseFeed(rss).entries;

    expect(first.externalId).toBe("ars-1");
    // Dedupe is on (feedId, externalId), so every entry must have one.
    expect(second.externalId).toBe("https://arstechnica.com/two");
  });

  it("drops an entry with no link, since there is nowhere to send you", () => {
    const entries = parseFeed(rss).entries;

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.title)).not.toContain("No link at all");
  });

  it("dates an undated entry to the epoch so it cannot look like breaking news", () => {
    const [first, second] = parseFeed(rss).entries;

    expect(first.publishedAt.toISOString()).toBe("2026-08-30T12:00:00.000Z");
    expect(second.publishedAt.getTime()).toBe(0);
  });

  it("reads dc:creator as the author", () => {
    expect(parseFeed(rss).entries[0].author).toBe("A Writer");
  });

  it("handles a channel with exactly one item", () => {
    const one = `<rss version="2.0"><channel><title>Solo</title>
      <item><title>Only</title><link>https://example.com/only</link></item>
    </channel></rss>`;

    // The parser forces item/entry to arrays: feeds are wildly inconsistent
    // about whether a single child is one.
    expect(parseFeed(one).entries).toHaveLength(1);
  });
});

describe("parseFeed, Atom", () => {
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Level1Techs</title>
  <entry>
    <id>yt:video:abc123</id>
    <title>A video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <author><name>Level1Techs</name></author>
    <published>2026-08-29T18:00:00+00:00</published>
    <updated>2026-08-30T09:00:00+00:00</updated>
  </entry>
</feed>`;

  it("takes the link from the attribute rather than the body", () => {
    const [entry] = parseFeed(atom).entries;

    expect(entry.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(entry.externalId).toBe("yt:video:abc123");
    expect(entry.author).toBe("Level1Techs");
  });

  it("prefers published over updated, so an edit does not resurface an item", () => {
    expect(parseFeed(atom).entries[0].publishedAt.toISOString()).toBe(
      "2026-08-29T18:00:00.000Z",
    );
  });

  it("ignores a link that is not the alternate", () => {
    const withSelf = atom.replace(
      "<link rel=\"alternate\"",
      '<link rel="self" href="https://example.com/feed.xml"/><link rel="alternate"',
    );

    expect(parseFeed(withSelf).entries[0].url).toBe("https://www.youtube.com/watch?v=abc123");
  });
});

describe("parseFeed, not a feed", () => {
  it("throws, which is how discovery tells a feed from a 200 that is not one", () => {
    expect(() => parseFeed("<html><body>Not a feed</body></html>")).toThrow();
  });
});

describe("feedName", () => {
  it("keeps a title that names its source", () => {
    expect(feedName("Ars Technica", "https://arstechnica.com/feed")).toBe("Ars Technica");
  });

  it("replaces a section heading with the host", () => {
    // The real case: dndbeyond.com's feed is titled, literally, "Posts".
    expect(feedName("Posts", "https://www.dndbeyond.com/posts.rss")).toBe("dndbeyond.com");
    expect(feedName("news", "https://example.org/rss")).toBe("example.org");
  });

  it("falls back to the host when the title is empty", () => {
    expect(feedName("   ", "https://example.org/rss")).toBe("example.org");
  });

  it("survives an unparseable url", () => {
    expect(feedName("Posts", "not a url")).toBe("Posts");
  });
});
