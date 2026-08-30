import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker runner copies .next/standalone and runs server.js.
  output: "standalone",
  // Native or Node-only packages that must not be bundled.
  serverExternalPackages: ["pino", "pino-pretty", "argon2"],
};

export default nextConfig;
