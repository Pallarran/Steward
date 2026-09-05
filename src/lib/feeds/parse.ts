import { XMLParser } from "fast-xml-parser";

export type FeedEntry = {
  externalId: string;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date;
};

export type ParsedFeed = {
  title: string;
  entries: FeedEntry[];
};

type Node = Record<string, unknown>;

/** Narrows an unknown branch to an object, or nothing. */
function node(value: unknown): Node | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

/** Entries are forced to arrays by the parser, but a feed may have none. */
function list(value: unknown): Node[] {
  return Array.isArray(value) ? (value.filter((v) => node(v) !== undefined) as Node[]) : [];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Feeds are wildly inconsistent about whether a single item is an array.
  isArray: (name) => ["item", "entry"].includes(name),
  trimValues: true,
});

/** Feeds put text in a bare string, in CDATA, or in `{ "#text": … }`. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const t = (value as Record<string, unknown>)["#text"];
    return typeof t === "string" ? t.trim() || null : null;
  }
  return null;
}

/**
 * The fuller of two candidates, ignoring nulls.
 *
 * Feeds are inconsistent about which element holds the post and which holds the
 * teaser, and a few send both with one of them empty. Taking whichever has more
 * to say is right in every case and needs no per-publisher knowledge.
 */
function longest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

/** Atom puts the link in an attribute; RSS puts it in the element's body. */
function link(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;

  const candidates = Array.isArray(value) ? value : [value];
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const rel = o["@rel"];
      if (rel === undefined || rel === "alternate") {
        const href = o["@href"];
        if (typeof href === "string" && href.trim()) return href.trim();
      }
    }
  }
  return null;
}

function date(...values: unknown[]): Date {
  for (const v of values) {
    const s = text(v);
    if (!s) continue;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // An entry with no usable date is not worth discarding, but dating it "now"
  // would let an old item masquerade as breaking. The epoch sorts it last,
  // which is the honest place for something we cannot date.
  return new Date(0);
}

/**
 * Parses RSS 2.0 and Atom into one shape.
 *
 * Normalizing at the edge, per docs/ARCHITECTURE.md rule 4: nothing downstream
 * should know or care which of the two a source happens to use.
 *
 * Throws when the body is not a feed at all, which is how discovery tells a
 * real feed from an HTML page that merely returned 200.
 */
export function parseFeed(xml: string): ParsedFeed {
  // A feed's parsed shape is genuinely unknown until inspected, so it is typed
  // as such and every field goes through the readers above rather than being
  // asserted into existence.
  const doc = parser.parse(xml) as Node;

  const rss = node(node(doc.rss)?.channel) ?? node(node(doc["rdf:RDF"])?.channel);
  const atom = node(doc.feed);

  if (rss) {
    const items = list(rss.item);
    return {
      title: text(rss.title) ?? "Untitled feed",
      entries: items.flatMap((i) => {
        const url = link(i.link) ?? text(i.guid);
        if (!url) return [];
        return [
          {
            externalId: text(i.guid) ?? url,
            title: text(i.title) ?? "(untitled)",
            url,
            // `content:encoded` first, from 2026-09-05. It is where most feeds
            // put the whole post, and `<description>` is then a teaser — which
            // is fine for the two-line dek on a card and thin for the reading
            // dialog. Longest wins rather than either alone: some feeds carry
            // an empty `content:encoded`, and a couple put the full text in
            // `description` and a summary in `content`.
            summary: longest(text(i["content:encoded"]), text(i.description)),
            author: text(i["dc:creator"]) ?? text(i.author),
            publishedAt: date(i.pubDate, i["dc:date"]),
          },
        ];
      }),
    };
  }

  if (atom) {
    const items = list(atom.entry);
    return {
      title: text(atom.title) ?? "Untitled feed",
      entries: items.flatMap((e) => {
        const url = link(e.link);
        if (!url) return [];
        return [
          {
            externalId: text(e.id) ?? url,
            title: text(e.title) ?? "(untitled)",
            url,
            // `?? ` until 2026-09-05, which took Atom's `<summary>` whenever it
            // existed and left `<content>` — the full post — unread. Same rule
            // as RSS now: whichever has more to say.
            summary: longest(text(e.content), text(e.summary)),
            author: text(node(e.author)?.name),
            publishedAt: date(e.published, e.updated),
          },
        ];
      }),
    };
  }

  throw new Error("That is not an RSS or Atom feed");
}
