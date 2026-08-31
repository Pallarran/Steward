import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker runner copies .next/standalone and runs server.js.
  output: "standalone",
  // Native or Node-only packages that must not be bundled.
  serverExternalPackages: ["pino", "pino-pretty", "argon2"],

  /**
   * Family merged into People on 2026-08-31.
   *
   * This is not only for bookmarks: queue rows written before the merge carry
   * `url: "/family"` in the database, and the old nudges set `url` on create
   * only, so those rows would have pointed at nothing for ever. The sync now
   * writes `url` on update too and they heal themselves — but a row that is
   * never touched again still lands somewhere.
   */
  async redirects() {
    return [{ source: "/family", destination: "/people", permanent: false }];
  },
};

export default nextConfig;
