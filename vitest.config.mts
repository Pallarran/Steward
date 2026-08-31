import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests cover the pure functions only — the parsers and the date logic.
 *
 * Nothing here touches the database or the network. Every one of these was
 * verified once by deploying it and looking at the screen, which proves it
 * worked that day and protects nothing afterwards. These run in under a second
 * and are the guard against the failure the PRD cares most about: something
 * quietly wrong that nobody notices.
 *
 * `.mts` rather than `.ts` so Vite loads it as the ES module it is written as.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Some modules under test import the Prisma client transitively. The
      // client builds its connection pool lazily and never connects unless a
      // query runs, so a placeholder is enough to let them load.
      DATABASE_URL: "postgresql://steward:test@localhost:5432/steward",
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
