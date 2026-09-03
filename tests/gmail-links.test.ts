import { describe, expect, it } from "vitest";
import { extractLinks } from "@/lib/adapters/gmail";

/**
 * Which links a mail row offers.
 *
 * **The only real judgement in this feature**, and the part most likely to
 * disappoint: an email carries dozens of URLs and three of them are worth a
 * button. Vincent's two examples are the cases these are written from — a Steam
 * wishlist sale that should offer Steam, and a school-portal notification that
 * should offer the portal — and in both the useful link is on the sender's own
 * domain, past a wall of tracking and unsubscribe furniture.
 */
const STEAM = `
<html><body>
  <img src="https://cdn.akamai.steamstatic.com/pixel.png">
  <a href="https://links.email.steampowered.com/t/abc123">View in browser</a>
  <a href="https://store.steampowered.com/app/1091500/Cyberpunk_2077/">Buy now</a>
  <a href="https://store.steampowered.com/app/1091500/?utm=2">Buy now, again</a>
  <a href="https://store.steampowered.com/account/preferences">Email preferences</a>
  <a href="https://help.steampowered.com/unsubscribe?id=9">Unsubscribe</a>
</body></html>
`;

describe("extractLinks", () => {
  it("puts the sender's own domain first", () => {
    // The whole rule. A Steam sale comes from steampowered.com and links to
    // store.steampowered.com past a tracking host that would otherwise win on
    // document order alone.
    const links = extractLinks(STEAM, "noreply@steampowered.com");
    expect(links?.[0]).toEqual({
      label: "Open store.steampowered.com",
      href: "https://store.steampowered.com/app/1091500/Cyberpunk_2077/",
    });
  });

  it("lets repetition beat a tracker on the sender's own domain", () => {
    // The case the sender-domain rule alone gets wrong, and a test caught it:
    // `links.email.steampowered.com` shares the registrable domain and appears
    // first, so it wins on document order. The shop appears on every call to
    // action; the "view in browser" link appears once.
    const first = extractLinks(STEAM, "noreply@steampowered.com")?.[0];
    expect(new URL(first!.href).host).toBe("store.steampowered.com");
  });

  it("drops unsubscribe and preference links", () => {
    const hrefs = extractLinks(STEAM, "noreply@steampowered.com")?.map((l) => l.href) ?? [];
    expect(hrefs.some((h) => /unsubscribe|preferences/.test(h))).toBe(false);
  });

  it("drops images and other assets", () => {
    const hrefs = extractLinks(STEAM, "noreply@steampowered.com")?.map((l) => l.href) ?? [];
    expect(hrefs.some((h) => h.endsWith(".png"))).toBe(false);
  });

  it("offers one button per host, not one per URL", () => {
    // The same shop linked eleven times is one destination. Eleven identical
    // buttons is not a choice.
    const links = extractLinks(STEAM, "noreply@steampowered.com") ?? [];
    const hosts = links.map((l) => new URL(l.href).host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("never offers more than three", () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://host${i}.example.com/x`).join(" ");
    expect(extractLinks(many, null)?.length).toBe(3);
  });

  it("finds bare URLs in a plain-text part", () => {
    // Plain-text mail has no href to match, which is why the extraction runs
    // over the raw download rather than over parsed markup.
    const links = extractLinks(
      "Votre message est disponible : https://portail.example.ca/messages/42",
      "notification@portail.example.ca",
    );

    expect(links).toEqual([
      { label: "Open portail.example.ca", href: "https://portail.example.ca/messages/42" },
    ]);
  });

  it("does not swallow the sentence's punctuation into the URL", () => {
    // A trailing full stop is prose. Left on, it produces a link that looks
    // right and 404s.
    const links = extractLinks("Go to https://example.com/page.", null);
    expect(links?.[0].href).toBe("https://example.com/page");
  });

  it("returns nothing for a message with no links at all", () => {
    expect(extractLinks("Just a note, no links here.", "a@b.com")).toEqual([]);
  });

  it("still ranks sensibly when the sender is unknown", () => {
    // `fromAddress` is nullable — an envelope without a from address is rare
    // but legal, and it must not throw.
    expect(() => extractLinks(STEAM, null)).not.toThrow();
    expect(extractLinks(STEAM, null)?.length).toBeGreaterThan(0);
  });
});
