import pino from "pino";

/**
 * One logger for the app process. The collectors added from step 5 onward log
 * through this, and every run's outcome is also written to SourceStatus —
 * docs/ARCHITECTURE.md rule 3: that record is not logging, it is the data that
 * drives the amber state in the UI.
 */
export const log = pino({
  name: "steward",
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});
