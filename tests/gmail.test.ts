import { describe, expect, it } from "vitest";
import { permalink } from "@/lib/adapters/gmail";

/**
 * The one detail in the Gmail adapter that looks correct and is not.
 *
 * IMAP hands over `X-GM-MSGID` as a decimal number. Gmail's web client
 * addresses a message by the **hex** form of that same id. Putting the decimal
 * in the URL produces a link that loads Gmail and then shows an empty pane —
 * no error, no redirect, just nothing, which is the hardest kind of wrong to
 * notice from the screen.
 */
describe("permalink", () => {
  it("converts Gmail's decimal message id to the hex the web client wants", () => {
    // 1868470012345678901 in hex. If this ever renders as decimal, every mail
    // row in the queue links to a blank pane.
    expect(permalink("1868470012345678901")).toBe(
      "https://mail.google.com/mail/u/0/#inbox/19ee23939f557c35",
    );
  });

  it("does not lose precision on a real 19-digit id", () => {
    // 1868470012345678901 is past Number.MAX_SAFE_INTEGER, which is why this
    // goes through BigInt: Number() rounds it to ...8900 and produces a
    // valid-looking link to a message that does not exist.
    const id = "1868470012345678901";
    expect(String(Number(id))).not.toBe(id);
    expect(permalink(id)).toContain(BigInt(id).toString(16));
  });

  it("falls back to the inbox for an id that is not a Gmail message id", () => {
    // The `uid:` form, used when a server does not advertise X-GM-EXT-1. A link
    // to the right place beats a link to nothing.
    expect(permalink("uid:4821")).toBe("https://mail.google.com/mail/u/0/#inbox");
  });
});
