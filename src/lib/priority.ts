/**
 * The queue's one ladder.
 *
 * **Every number here used to be a bare literal at its own producer's write
 * site**, in six files — `subscriptions.ts`, `todoist.ts`, `ha.ts`, `people.ts`,
 * `kuma.ts`, `unraid.ts` — so no two could be compared by reading either one.
 * That is how a Home Assistant *Core* update came to outrank money leaving the
 * account tomorrow, and nobody could see it. The rungs are now in one place and
 * the only way to read one is to look at all of them.
 *
 * **Priority 0 is not "very important". It is an alarm** — something is broken
 * and it will not resolve by being read. Only two things write it: a monitor
 * that stopped responding, and an array disk Unraid has disabled. The test for
 * a third is the same: would leaving this until tomorrow cost something that
 * cannot be got back?
 *
 * **The gaps are deliberate.** A new rung should land between two existing ones
 * without renumbering the ladder, because renumbering means every row already
 * in the database is wrong until its producer next runs.
 *
 * **This file imports nothing, and must not start.** It is read by `queue-row`,
 * which is a client component; the alarm constant lived in `lib/queue.ts` for
 * one commit and dragged Prisma and `pg` into the browser bundle, which the
 * build caught with `Module not found: Can't resolve 'dns'`.
 */
export const ALARM_PRIORITY = 0;

export const PRIORITY = {
  /** Broken, and losing something while it waits. */
  alarm: ALARM_PRIORITY,

  /**
   * Money leaves today or tomorrow, and the cancel link still works.
   *
   * **Above the inbox, which is the whole point of this rung.** A renewal used
   * to sit flat at 30 and therefore below every untriaged thought in Todoist,
   * however close it was to charging.
   */
  renewalNow: 5,
  renewalNear: 15,

  /** Untriaged: it arrived and nobody has decided anything about it yet. */
  inbox: 20,

  /**
   * An unread email.
   *
   * **Just below the inbox, deliberately.** A Todoist capture is something
   * Vincent chose to write down; a mail is somebody else's demand, arriving
   * unasked. Unread does not mean important, and the day's own list should not
   * be pushed down by whatever happened to be sent overnight.
   */
  mail: 22,

  /**
   * In its notice window but not yet pressing. **Below the inbox, deliberately**
   * — a fortnight's warning is awareness, not work.
   */
  renewalWatch: 25,

  /** A person, past a cadence he set himself. An invitation, not a demand. */
  relationship: 40,

  /**
   * Worth doing, never urgent — and never above a person or a deadline. The
   * platform gets a rung of its own because which one is waiting changes what
   * you do about it; the rest arrive rolled up.
   */
  updateSystem: 50,
  updateAddon: 55,
  updateHacs: 58,
  updateFirmware: 60,
} as const;

/**
 * Where a renewal sits, by how close it is.
 *
 * It used to be a constant, so a renewal could not climb — and because
 * `syncSubscriptionNudges` wrote `priority` on `create` only, the row it first
 * wrote a fortnight out kept that rank on the morning it charged. Both halves
 * had to change: this function, and `priority` moving into the `update` clause.
 *
 * The row's external id carries the renewal date, so one cycle is one row and
 * this walks it up the list as the day approaches.
 */
export function renewalPriority(daysAway: number): number {
  if (daysAway <= 1) return PRIORITY.renewalNow;
  if (daysAway <= 3) return PRIORITY.renewalNear;
  return PRIORITY.renewalWatch;
}
