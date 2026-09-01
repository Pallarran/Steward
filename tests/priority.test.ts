import { describe, expect, it } from "vitest";
import { ALARM_PRIORITY, PRIORITY, renewalPriority } from "@/lib/priority";

/**
 * The queue's ordering had no tests at all, which is how it drifted.
 *
 * Vincent found it from the screen: a subscription renewing tomorrow sat at the
 * bottom of the list, below untriaged thoughts from the Todoist inbox. The
 * cause was that every priority was a bare literal at its own producer's write
 * site — six files — so no two could be compared by reading either one, and a
 * renewal was pinned at a single number however close it was to charging.
 *
 * These pin the comparisons, not the numbers: the rungs can be renumbered, the
 * order they express cannot change by accident.
 */
describe("renewalPriority", () => {
  it("puts a renewal today or tomorrow above the Todoist inbox", () => {
    // The bug, stated as a test. Money leaves in the morning and the cancel
    // link still works; a thought captured last week does not expire.
    expect(renewalPriority(0)).toBeLessThan(PRIORITY.inbox);
    expect(renewalPriority(1)).toBeLessThan(PRIORITY.inbox);
  });

  it("keeps a renewal three days out above the inbox as well", () => {
    expect(renewalPriority(3)).toBeLessThan(PRIORITY.inbox);
  });

  it("puts one still a fortnight off below the inbox", () => {
    // Inside its notice window, so it earns a row — but a fortnight's warning
    // is awareness, not work, and it must not push the day's business down.
    expect(renewalPriority(14)).toBeGreaterThan(PRIORITY.inbox);
  });

  it("climbs as the day approaches, never falls", () => {
    const walk = [14, 7, 4, 3, 2, 1, 0].map(renewalPriority);
    for (let i = 1; i < walk.length; i++) expect(walk[i]).toBeLessThanOrEqual(walk[i - 1]);
  });

  it("never reaches the alarm rung", () => {
    // An alarm means something is broken and losing what cannot be got back.
    // A renewal is money about to leave on schedule, which is not that.
    expect(renewalPriority(0)).toBeGreaterThan(ALARM_PRIORITY);
  });
});

describe("the ladder", () => {
  it("keeps unread mail below Vincent's own captures", () => {
    // Somebody else's demand, arriving unasked, against something he chose to
    // write down. Unread does not mean important.
    expect(PRIORITY.mail).toBeGreaterThan(PRIORITY.inbox);
    // But still above a renewal that is a fortnight off, and well above updates.
    expect(PRIORITY.mail).toBeLessThan(PRIORITY.renewalWatch);
  });

  it("sorts alarm, deadline, inbox, mail, people, updates — in that order", () => {
    const rungs = [
      PRIORITY.alarm,
      PRIORITY.renewalNow,
      PRIORITY.renewalNear,
      PRIORITY.inbox,
      PRIORITY.mail,
      PRIORITY.renewalWatch,
      PRIORITY.relationship,
      PRIORITY.updateSystem,
      PRIORITY.updateAddon,
      PRIORITY.updateHacs,
      PRIORITY.updateFirmware,
    ];

    for (let i = 1; i < rungs.length; i++) expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
  });

  it("keeps every Home Assistant update below a person", () => {
    // This one is the correction, not a restatement: Core updates used to sit
    // at 10, above the inbox and above every renewal, and a HACS card at 40
    // outranked a daughter with no plan at 50.
    for (const update of [
      PRIORITY.updateSystem,
      PRIORITY.updateAddon,
      PRIORITY.updateHacs,
      PRIORITY.updateFirmware,
    ]) {
      expect(update).toBeGreaterThan(PRIORITY.relationship);
      expect(update).toBeGreaterThan(PRIORITY.inbox);
    }
  });

  it("leaves the alarm rung to the alarm, and gives it to nothing else", () => {
    const others = Object.entries(PRIORITY).filter(([name]) => name !== "alarm");
    expect(PRIORITY.alarm).toBe(ALARM_PRIORITY);
    for (const [, value] of others) expect(value).toBeGreaterThan(ALARM_PRIORITY);
  });
});
