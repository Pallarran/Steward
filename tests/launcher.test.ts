import { describe, expect, it } from "vitest";
import { groupOf, orderGroups } from "@/lib/launcher";

const tile = (name: string, group: string) => ({ name, group });

describe("groupOf", () => {
  it("falls back to Other, the one way", () => {
    // Normalised in one place now. It used to be applied at render *and* in
    // addTile, which is how "Media" and " Media " could become two groups.
    expect(groupOf({ group: "" })).toBe("Other");
    expect(groupOf({ group: "   " })).toBe("Other");
    expect(groupOf({ group: " Media " })).toBe("Media");
  });

  it("keeps case, because the user typed it", () => {
    expect(groupOf({ group: "media" })).toBe("media");
  });
});

describe("orderGroups", () => {
  const tiles = [
    tile("Jellyfin", "Media"),
    tile("Home Assistant", "Home"),
    tile("Sonarr", "Media"),
    tile("Unraid", "Home"),
  ];

  it("with no stored order, derives it exactly as before", () => {
    // The deploy that introduced the stored order must not reshuffle anything:
    // there is no row until a group is first moved, and until then this has to
    // be the old behaviour — first appearance in the tile array.
    expect(orderGroups(tiles, null)).toEqual(["Media", "Home"]);
  });

  it("collects a group's scattered tiles under one heading", () => {
    // Tiles of one group need not be contiguous in storage.
    expect(orderGroups(tiles, null)).toHaveLength(2);
  });

  it("lets a stored order override the tiles", () => {
    expect(orderGroups(tiles, ["Home", "Media"])).toEqual(["Home", "Media"]);
  });

  it("appends a group the tiles name but the order does not", () => {
    // The safety rule. A tile must never become invisible by naming a group
    // nobody registered, which is exactly what a filter would have done.
    expect(orderGroups(tiles, ["Home"])).toEqual(["Home", "Media"]);
  });

  it("keeps a stored group that holds no tiles", () => {
    // This is what makes "create a group, then fill it" possible, and what
    // makes removing an empty one meaningful.
    expect(orderGroups(tiles, ["Media", "Home", "Later"])).toEqual(["Media", "Home", "Later"]);
  });

  it("treats an unreadable stored order as no opinion, not as no groups", () => {
    // readGroupOrder returns null rather than [] on a parse failure. With []
    // this would still list every group, because of the append rule — but the
    // distinction is what keeps a corrupt row from being taken as intent.
    expect(orderGroups(tiles, [])).toEqual(["Media", "Home"]);
  });

  it("holds an empty launcher without inventing anything", () => {
    expect(orderGroups([], null)).toEqual([]);
    expect(orderGroups([], ["Media"])).toEqual(["Media"]);
  });

  it("groups untitled tiles under Other", () => {
    expect(orderGroups([tile("Odd", "")], null)).toEqual(["Other"]);
  });
});
