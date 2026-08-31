/**
 * Queue priority, and the one value that means something.
 *
 * **Priority 0 is not "very important". It is an alarm** — something is broken
 * and it will not resolve by being read. Only two things write it: a monitor
 * that stopped responding, and an array disk Unraid has disabled. Everything
 * else starts at 10, and Todoist's own priorities begin at 1, so the value is
 * unambiguous and the queue row can safely give it its own treatment.
 *
 * If a third thing ever wants it, the test is the same: would leaving this for
 * tomorrow cost something that cannot be got back?
 *
 * **This file imports nothing, and must not start.** It is read by `queue-row`,
 * which is a client component; the constant lived in `lib/queue.ts` for one
 * commit and dragged Prisma and `pg` into the browser bundle, which the build
 * caught with `Module not found: Can't resolve 'dns'`.
 */
export const ALARM_PRIORITY = 0;
