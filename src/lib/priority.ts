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
 * ---
 *
 * **Moving a rung is worthless unless `priority` is in the producer's `update`
 * clause, not only its `create`.** Every producer upserts, so a rank set at
 * creation is a rank for life: the new number applies to rows written after the
 * change and to nothing else, which in a steady-state queue is nothing at all.
 *
 * This has now been missed twice — a renewal was pinned at 30 however close it
 * came to charging, and the Todoist Inbox stayed at 20 after being moved to the
 * bottom, both times looking exactly like a ladder that had simply not been
 * deployed. The rule lives here rather than beside each `upsert`, because this
 * file is the one anybody opens when they change a rung.
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
   * A renewal used to sit flat at 30 however close it was to charging, which
   * put it below every untriaged thought in Todoist. Both halves of that have
   * since been fixed — the rank climbs, and the inbox went to the bottom.
   */
  renewalNow: 5,
  renewalNear: 15,

  /**
   * A TLS certificate inside its warning window.
   *
   * **Not an alarm**, because nothing is broken yet — the service is answering
   * perfectly, which is exactly why it needs a row: no other surface in Steward
   * would mention it, and the first sign otherwise would be a browser refusing
   * the site. It fails on a known date, which makes it a deadline, and deadlines
   * live up here with the renewals.
   *
   * Below `renewalNear` because money leaving the account in three days cannot
   * be got back, and a certificate can be renewed the moment you notice.
   * Above `mail` because it has a date and mail does not.
   */
  cert: 18,

  /**
   * An unread email. Somebody else's demand, arriving unasked — but a demand
   * with a sender waiting on it, which is more than an untriaged idea has.
   */
  mail: 22,

  /**
   * In its notice window but not yet pressing — a fortnight's warning is
   * awareness rather than work, so it sits below today's mail.
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

  /**
   * Todoist's Inbox: the bottom rung, and the last thing on the list.
   *
   * **Moved from 20 to 70 on 2026-09-02**, at Vincent's instruction, and the
   * reasoning is his: these are *"items or ideas that don't have a priority
   * yet"*. That is the whole point of an inbox — a place to put a thought so it
   * stops taking up room, deliberately before any decision has been made about
   * it. A thing nobody has yet judged important cannot outrank the things
   * already judged so, which at 20 it did: above unread mail, above a renewal a
   * fortnight out, above every person and every update.
   *
   * The rung it vacated is why `mail` sits at 22 with room above it.
   */
  inbox: 70,
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
