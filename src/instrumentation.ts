import { log } from "@/lib/log";

const TZ = "America/Toronto";

/**
 * The scheduler lives in the app process rather than a jobs container, which
 * is why Steward must never run more than one instance: a second one means
 * every collector runs twice. There is no leader election and there does not
 * need to be — see CLAUDE.md.
 *
 * The two guards in register() are what make that safe inside a single
 * process.
 */
export async function register() {
  // The edge runtime must not schedule anything.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dev HMR can re-evaluate this module, so the flag lives on globalThis
  // rather than in module scope, the same way the Prisma client does.
  const g = globalThis as unknown as { __stewardSchedulerStarted?: boolean };
  if (g.__stewardSchedulerStarted) return;
  g.__stewardSchedulerStarted = true;

  const cron = (await import("node-cron")).default;

  /**
   * docs/ARCHITECTURE.md rule 2: errors are isolated per source. One adapter
   * throwing must never stop the other six, and must never crash the app
   * process.
   *
   * The await is what makes that true. node-cron does not await the callback,
   * so a bare try/catch around an async call catches nothing — the rejection
   * escapes as an unhandled rejection and takes the process down with it.
   * Every job goes through here for that reason.
   */
  function job(name: string, expression: string, run: () => Promise<void> | void) {
    cron.schedule(
      expression,
      () => {
        void (async () => {
          try {
            await run();
          } catch (err) {
            log.error({ err, job: name }, "Job failed");
          }
        })();
      },
      { timezone: TZ },
    );
  }

  // One entry per adapter. runAdapter is the only thing that writes
  // SourceStatus, so no collector can forget to record its outcome.
  const { runAdapter } = await import("@/lib/adapters/run");
  const { kumaAdapter } = await import("@/lib/adapters/kuma");
  const { todoistAdapter } = await import("@/lib/adapters/todoist");
  const { haAdapter } = await import("@/lib/adapters/ha");
  const { rssAdapter } = await import("@/lib/adapters/rss");
  const { horizonAdapter } = await import("@/lib/adapters/horizon");

  // 60s, and it drives the gate — docs/ARCHITECTURE.md, collector intervals.
  job("kuma", "* * * * *", () => runAdapter(kumaAdapter));
  // 5 min. Tasks due, and Todoist's Inbox into the queue.
  job("todoist", "*/5 * * * *", () => runAdapter(todoistAdapter));
  // 5 min. Calendars into Today, update.* into the queue.
  job("ha", "*/5 * * * *", () => runAdapter(haAdapter));
  // Hourly, on the hour, into the staging pool — never into the queue.
  job("rss", "0 * * * *", () => runAdapter(rssAdapter));
  // 15 min. The portfolio summary; Horizon itself fetches prices five times a
  // day on weekdays, so polling harder would learn the same number again.
  job("horizon", "*/15 * * * *", () => runAdapter(horizonAdapter));

  // 07:00. Not an adapter either — it reads Steward's own list rather than a
  // source, so there is nothing that can be stale. One quiet line per person
  // who has slipped past the mark Vincent set, and the row leaves by itself
  // when he records the call.
  const { syncPeopleNudges } = await import("@/lib/people");
  job("people", "0 7 * * *", async () => {
    log.info({ job: "people", summary: await syncPeopleNudges() }, "People checked");
  });

  // 03:00. Not an adapter: it reads no source and has no panel, so it records
  // nothing to SourceStatus and cannot make anything go amber. Its failure mode
  // is a database that grows, which is a slow problem rather than a wrong one.
  const { runHousekeeping } = await import("@/lib/housekeeping");
  job("housekeeping", "0 3 * * *", async () => {
    log.info({ job: "housekeeping", summary: await runHousekeeping() }, "Housekeeping ran");
  });

  log.info(
    {
      collectors: ["kuma", "todoist", "ha", "rss", "horizon"],
      jobs: ["people", "housekeeping"],
      timezone: TZ,
    },
    "Scheduler started",
  );

  // Run every collector once at boot rather than waiting for the first tick.
  // Todoist's is a five-minute cron, so after a restart the panels would show
  // pre-restart data for up to five minutes — inside the staleness threshold,
  // so nothing would lie, but there is no reason to make Vincent wait or to
  // make a deploy unverifiable until the clock catches up.
  //
  // Deliberately not awaited: register() blocks the server from accepting
  // requests, and a slow source must not delay the page. runAdapter records
  // its own outcome and never throws.
  // ignoreBackoff: a restart is a deliberate act, usually the deploy that
  // fixes whatever was failing. Serving out the remaining backoff would make
  // the fix look like it had not worked.
  const boot = { ignoreBackoff: true };
  void runAdapter(kumaAdapter, new Date(), boot);
  void runAdapter(todoistAdapter, new Date(), boot);
  void runAdapter(haAdapter, new Date(), boot);
  void runAdapter(rssAdapter, new Date(), boot);
  void runAdapter(horizonAdapter, new Date(), boot);
}
