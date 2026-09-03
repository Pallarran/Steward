import { describe, expect, it } from "vitest";
import { dueDateFor, withLabel } from "@/lib/triage";

/**
 * What a triage choice actually sends to Todoist.
 *
 * The two pieces of real judgement in filing a thought, and the two that fail
 * quietly: a date a day out is a task that reads as scheduled and is wrong, and
 * a label list that replaces rather than merges silently forgets who else a
 * chore was about.
 */
const noon = (iso: string) => new Date(`${iso}T16:00:00Z`); // 12:00 in Toronto, EDT

describe("dueDateFor", () => {
  it("gives today's house date for today", () => {
    expect(dueDateFor("today", noon("2026-09-02"))).toBe("2026-09-02");
  });

  it("gives the next calendar day for tomorrow", () => {
    expect(dueDateFor("tomorrow", noon("2026-09-02"))).toBe("2026-09-03");
  });

  it("counts a week as seven calendar days", () => {
    expect(dueDateFor("week", noon("2026-09-02"))).toBe("2026-09-09");
  });

  it("uses the house's day, not UTC's", () => {
    // 01:30Z on the 2nd is 21:30 on the 1st in Toronto. Filing something for
    // "today" late in the evening must not date it tomorrow.
    expect(dueDateFor("today", new Date("2026-09-02T01:30:00Z"))).toBe("2026-09-01");
  });

  it("does not drift across the daylight-saving fallback", () => {
    // 2026-11-01 is the fallback in America/Toronto. Adding 7 × 24 hours to an
    // instant lands an hour early and can name the day before; stepping
    // calendar days from noon cannot.
    expect(dueDateFor("week", noon("2026-10-29"))).toBe("2026-11-05");
  });

  describe("the weekend", () => {
    it("finds the coming Saturday", () => {
      // 2026-09-02 is a Wednesday.
      expect(dueDateFor("weekend", noon("2026-09-02"))).toBe("2026-09-05");
    });

    it("means next Saturday when it is already Saturday", () => {
      // Choosing "Saturday" on a Saturday is putting it off, not scheduling it
      // for four hours' time. 2026-09-05 is a Saturday.
      expect(dueDateFor("weekend", noon("2026-09-05"))).toBe("2026-09-12");
    });

    it("means tomorrow on a Friday", () => {
      expect(dueDateFor("weekend", noon("2026-09-04"))).toBe("2026-09-05");
    });
  });

  it("has no date for 'no date' or for a date picked by hand", () => {
    // `pick` supplies its own; there is nothing here to compute.
    expect(dueDateFor("none", noon("2026-09-02"))).toBeNull();
    expect(dueDateFor("pick", noon("2026-09-02"))).toBeNull();
  });
});

describe("withLabel", () => {
  it("adds the owner to a thought that had none", () => {
    expect(withLabel([], "Vincent")).toEqual(["Vincent"]);
  });

  it("keeps the labels a thought already carried", () => {
    // Filing is a decision about who owns it, not an instruction to forget
    // everything else that was said about it.
    expect(withLabel(["Naomi"], "Vincent")).toEqual(["Naomi", "Vincent"]);
  });

  it("does not add one twice", () => {
    expect(withLabel(["Vincent"], "Vincent")).toEqual(["Vincent"]);
  });

  it("leaves the list alone when it is filed to nobody", () => {
    // A shared chore belongs to the house. That must not strip the labels it
    // arrived with.
    expect(withLabel(["Naomi"], null)).toEqual(["Naomi"]);
  });
});
