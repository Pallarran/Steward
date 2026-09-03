import { describe, expect, it } from "vitest";
import { eventWhen, lateWhen, taskWhen, wasteWhen } from "@/components/today/today-card";

/**
 * The when column on Home's right-hand cards.
 *
 * **This logic has already shipped one bug and it was invisible.** The task
 * label read `late ? when(...) : dueAt ? clock(dueAt) : "today"`, and `late` is
 * `dueDate < today` — so every task in *Upcoming*, where by construction the
 * due date is in the future, fell through to a hardcoded "today". An all-day
 * task due tomorrow said "today"; a timed one showed a bare `09:00` that read
 * as this morning. Vincent found it on the screen, because nothing here was
 * tested and the type checker had nothing to object to.
 *
 * These are the edges of the rewritten version.
 */
const TODAY = "2026-09-02";

describe("taskWhen", () => {
  it("says nothing for an untimed task due today", () => {
    // The group heading above it already says "Due today". Repeating that on
    // every row is the noise the 2026-09-02 rewrite removed.
    expect(taskWhen({ dueDate: TODAY, dueAt: null }, TODAY)).toBe("");
  });

  it("says nothing for an untimed task due tomorrow", () => {
    // The *Upcoming* card is tomorrow by construction — HORIZON_DAYS is 1 — so
    // the card has said it. This is the branch that used to say "today".
    expect(taskWhen({ dueDate: "2026-09-03", dueAt: null }, TODAY)).toBe("");
  });

  it("gives the clock time when the task carries one, today or tomorrow", () => {
    const at = new Date("2026-09-02T13:30:00-04:00");
    expect(taskWhen({ dueDate: TODAY, dueAt: at }, TODAY)).toMatch(/\d{2}:\d{2}/);
    expect(taskWhen({ dueDate: "2026-09-03", dueAt: at }, TODAY)).toMatch(/\d{2}:\d{2}/);
  });

  it("counts the days on a late task rather than saying 'late'", () => {
    expect(taskWhen({ dueDate: "2026-09-01", dueAt: null }, TODAY)).toBe("yesterday");
    expect(taskWhen({ dueDate: "2026-08-30", dueAt: null }, TODAY)).toBe("3d late");
  });

  it("keeps the day, not the time, on a late task that had one", () => {
    // How late it is outranks what hour it was meant to happen: the hour has
    // been and gone, and on the Late card the day is the actionable fact.
    expect(
      taskWhen({ dueDate: "2026-08-30", dueAt: new Date("2026-08-30T09:00:00-04:00") }, TODAY),
    ).toBe("3d late");
  });
});

describe("lateWhen", () => {
  it("counts whole days, however far back", () => {
    expect(lateWhen("2026-09-01", TODAY)).toBe("yesterday");
    expect(lateWhen("2026-08-31", TODAY)).toBe("2d late");
    expect(lateWhen("2026-08-03", TODAY)).toBe("30d late");
  });

  it("crosses a month boundary without drifting", () => {
    // Parsed at noon UTC on both sides, so a DST change in the house cannot
    // move either day into the one beside it.
    expect(lateWhen("2026-08-31", "2026-09-01")).toBe("yesterday");
  });
});

describe("wasteWhen", () => {
  const now = new Date("2026-09-02T18:00:00-04:00");

  it("distinguishes the collection day from the evening the bin goes out", () => {
    // Tonight for a tomorrow-morning collection: the bin goes to the kerb this
    // evening, which is the thing to actually do.
    expect(wasteWhen(TODAY, TODAY, now)).toBe("today");
    expect(wasteWhen("2026-09-03", TODAY, now)).toBe("tonight");
  });

  it("names a weekday further out, and never a bare date", () => {
    expect(wasteWhen("2026-09-05", TODAY, now)).toBe("Sat");
  });

  it("fits the 58px column", () => {
    // `out tonight` was eleven characters in a column that holds about seven.
    for (const date of [TODAY, "2026-09-03", "2026-09-05"]) {
      expect(wasteWhen(date, TODAY, now).length).toBeLessThanOrEqual(7);
    }
  });
});

describe("eventWhen", () => {
  it("says 'all day' for an appointment with no start time", () => {
    expect(eventWhen({ allDay: true, startAt: null })).toBe("all day");
    expect(eventWhen({ allDay: false, startAt: null })).toBe("all day");
  });

  it("gives the clock time otherwise", () => {
    expect(eventWhen({ allDay: false, startAt: new Date("2026-09-02T09:00:00-04:00") })).toMatch(
      /\d{2}:\d{2}/,
    );
  });
});
