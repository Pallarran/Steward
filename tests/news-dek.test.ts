import { describe, expect, it } from "vitest";
import { dek } from "@/lib/news";

/**
 * The line under a headline.
 *
 * `Article.summary` has been collected since the parser was written and
 * rendered nowhere, so nothing has ever had to be true about its contents. A
 * feed's `<description>` is routinely HTML, and the parser stores exactly what
 * arrived — trimmed and otherwise untouched, which was right while nothing
 * printed it.
 *
 * Every case here is markup or an entity reaching the screen.
 */
describe("dek", () => {
  it("strips tags", () => {
    expect(dek("<p>A new <em>release</em> lands today.</p>", "Release")).toBe(
      "A new release lands today.",
    );
  });

  it("leaves no gap where a tag was", () => {
    // Tags become a space and the whitespace is collapsed after, so an inline
    // tag does not weld two words together and a block one does not leave a
    // double space.
    expect(dek("<b>Two</b><i>words</i>", "x")).toBe("Two words");
  });

  it("decodes the entities a feed actually uses", () => {
    expect(dek("Bell&nbsp;&amp; Rogers &lt;here&gt; &quot;now&quot; &#39;then&#39;", "x")).toBe(
      `Bell & Rogers <here> "now" 'then'`,
    );
  });

  it("decodes numeric escapes", () => {
    expect(dek("Caf&#233; open", "x")).toBe("Café open");
  });

  /**
   * The bug Vincent saw. The first version knew six named entities and only the
   * decimal numeric form, so a publisher writing typographic punctuation — which
   * they do constantly — got the raw escape on screen.
   */
  it("decodes typographic punctuation", () => {
    expect(dek("It&rsquo;s here &mdash; and it&rsquo;s good&hellip;", "x")).toBe(
      "It’s here — and it’s good…",
    );
  });

  it("decodes curly quotes and an en dash", () => {
    expect(dek("&ldquo;Quoted&rdquo; 2020&ndash;2024", "x")).toBe("“Quoted” 2020–2024");
  });

  it("decodes hex escapes, not only decimal", () => {
    // At least as common as the decimal form, and it was passing through raw.
    expect(dek("It&#x2019;s &#x2014; here", "x")).toBe("It’s — here");
  });

  it("decodes the accents a Québec feed writes", () => {
    expect(dek("&Eacute;lection &agrave; Montr&eacute;al, ao&ucirc;t", "x")).toBe(
      "Élection à Montréal, août",
    );
  });

  it("survives a codepoint above the basic plane", () => {
    // `String.fromCharCode` truncates past U+FFFF and returns a lone surrogate.
    expect(dek("Ship it &#x1F680; today", "x")).toBe("Ship it 🚀 today");
  });

  it("leaves an escape it does not know rather than guessing", () => {
    expect(dek("A &oplus; B and &#xZZZZ; too", "x")).toBe("A &oplus; B and &#xZZZZ; too");
  });

  it("decodes after stripping tags, not before", () => {
    // A feed writing `&lt;p&gt;` means the characters. Decoding first would turn
    // its own escaped example into a tag and then delete it.
    expect(dek("Write &lt;p&gt; for a paragraph", "x")).toBe("Write <p> for a paragraph");
  });

  it("collapses the whitespace a stripped block leaves behind", () => {
    expect(dek("<div>\n  One\n</div>\n<div>\n  Two\n</div>", "x")).toBe("One Two");
  });

  it("says nothing when the feed repeats the headline", () => {
    // Plenty of feeds set description to title. Printing it under itself is
    // worse than printing nothing.
    expect(dek("Steam Autumn Sale begins", "Steam Autumn Sale begins")).toBeNull();
  });

  it("catches a repeated headline that has been extended", () => {
    // The commoner shape: the title, then a full stop and the first sentence.
    expect(
      dek("Steam Autumn Sale begins today with thousands of discounts", "Steam Autumn Sale begins"),
    ).toBeNull();
  });

  it("keeps a summary that merely starts with a similar word", () => {
    expect(dek("Steam has announced something else entirely", "Steam Autumn Sale begins")).toBe(
      "Steam has announced something else entirely",
    );
  });

  it("truncates a long one with an ellipsis", () => {
    const long = "word ".repeat(200);
    const result = dek(long, "x")!;

    expect(result.length).toBeLessThanOrEqual(221);
    expect(result.endsWith("…")).toBe(true);
  });

  it("has nothing to say about a feed that gave nothing", () => {
    expect(dek(null, "x")).toBeNull();
    expect(dek("", "x")).toBeNull();
    // Markup that reduces to nothing at all is the same as none.
    expect(dek("<img src='x.png'>", "x")).toBeNull();
  });
});
