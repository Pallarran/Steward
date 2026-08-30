import { log } from "@/lib/log";

const TZ = "America/Toronto";

/**
 * The scheduler lives in the app process rather than a jobs container, which
 * is why Steward must never run more than one instance: a second one means
 * every collector runs twice. There is no leader election and there does not
 * need to be — see CLAUDE.md.
 *
 * The two guards below are what make that safe inside a single process.
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

  // Step 1's acceptance test. From step 5 this becomes one entry per adapter;
  // the shape does not change.
  cron.schedule(
    "* * * * *",
    () => {
      // Every run gets its own try/catch. From step 5 this is what guarantees
      // one adapter throwing cannot stop the other six or bring down the app
      // process — docs/ARCHITECTURE.md, rule 2.
      try {
        log.info({ at: new Date().toISOString() }, "heartbeat");
      } catch (err) {
        log.error({ err }, "heartbeat failed");
      }
    },
    { timezone: TZ },
  );

  log.info({ heartbeat: "every minute", timezone: TZ }, "Scheduler started");
}
