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
