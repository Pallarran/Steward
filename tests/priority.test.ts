import { describe, expect, it } from "vitest";
import { ALARM_PRIORITY, PRIORITY, RUNG_LABEL, renewalPriority } from "@/lib/priority";

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

  it("puts even one a fortnight off above the inbox", () => {
    // This assertion was the other way round until 2026-09-02, and both
    // versions are right about their own ladder: a fortnight's warning is
    // awareness rather than work, and it used to sit below the inbox for that
    // reason. Then the inbox went to the bottom, because a thought nobody has
    // judged yet cannot outrank a date that is already known.
    expect(renewalPriority(14)).toBeLessThan(PRIORITY.inbox);
    // It is still the lowest of the three renewal rungs, which is the part
    // that never changed.
    expect(renewalPriority(14)).toBeGreaterThan(renewalPriority(3));
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
  it("leaves the Todoist inbox at the very bottom", () => {
    // Vincent's own rule, 2026-09-02: these are items and ideas that do not
    // have a priority yet, which is what an inbox is for. Nothing that has been
    // judged can rank below something nobody has judged.
    for (const rung of Object.values(PRIORITY)) {
      if (rung !== PRIORITY.inbox) expect(rung).toBeLessThan(PRIORITY.inbox);
    }
  });

  it("keeps unread mail above the inbox and below a near renewal", () => {
    expect(PRIORITY.mail).toBeLessThan(PRIORITY.inbox);
    expect(PRIORITY.mail).toBeGreaterThan(PRIORITY.renewalNear);
  });

  it("puts an expiring certificate between a near renewal and the mail", () => {
    // Below a renewal because money leaving in three days cannot be got back
    // and a certificate can be renewed the moment you notice. Above mail
    // because it fails on a known date and mail does not.
    expect(PRIORITY.cert).toBeGreaterThan(PRIORITY.renewalNear);
    expect(PRIORITY.cert).toBeLessThan(PRIORITY.mail);
  });

  it("does not let an expiring certificate become an alarm", () => {
    // Nothing is broken yet — the service is answering perfectly, which is the
    // whole reason it needs a row. Priority 0 is reserved for something that is
    // losing value while it waits.
    expect(PRIORITY.cert).toBeGreaterThan(ALARM_PRIORITY);
  });

  it("sorts alarm, deadline, mail, people, updates, inbox — in that order", () => {
    const rungs = [
      PRIORITY.alarm,
      PRIORITY.renewalNow,
      PRIORITY.renewalNear,
      PRIORITY.cert,
      PRIORITY.mail,
      PRIORITY.renewalWatch,
      PRIORITY.relationship,
      PRIORITY.updateSystem,
      PRIORITY.updateAddon,
      PRIORITY.updateHacs,
      PRIORITY.updateFirmware,
      PRIORITY.inbox,
    ];

    for (let i = 1; i < rungs.length; i++) expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
  });

  it("has a word for every rung", () => {
    // The row says why it is where it is, and a rung with no label says
    // nothing — which is the state the whole ladder was in until 2026-09-04.
    // A new rung added without a word is the way back to that.
    for (const rung of Object.values(PRIORITY)) {
      expect(RUNG_LABEL[rung]).toBeTruthy();
    }
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
      expect(update).toBeGreaterThan(PRIORITY.mail);
    }
  });

  it("leaves the alarm rung to the alarm, and gives it to nothing else", () => {
    const others = Object.entries(PRIORITY).filter(([name]) => name !== "alarm");
    expect(PRIORITY.alarm).toBe(ALARM_PRIORITY);
    for (const [, value] of others) expect(value).toBeGreaterThan(ALARM_PRIORITY);
  });
});
