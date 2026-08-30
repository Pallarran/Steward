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

  // 60s, and it drives the gate — docs/ARCHITECTURE.md, collector intervals.
  job("kuma", "* * * * *", () => runAdapter(kumaAdapter));
  // 5 min. Tasks due, and Todoist's Inbox into the queue.
  job("todoist", "*/5 * * * *", () => runAdapter(todoistAdapter));

  log.info({ collectors: ["kuma", "todoist"], timezone: TZ }, "Scheduler started");
}
