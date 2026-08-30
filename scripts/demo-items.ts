/**
 * Step 3's acceptance test, and a way to put something in the queue while the
 * adapters are still being built.
 *
 *   docker compose run --rm app npx tsx scripts/demo-items.ts add
 *   docker compose run --rm app npx tsx scripts/demo-items.ts list
 *   docker compose run --rm app npx tsx scripts/demo-items.ts clear
 *
 * Everything it writes carries the externalId prefix `demo:`, so `clear`
 * removes exactly what `add` created and nothing a real adapter produced.
 *
 * These are demo rows, not seed data: `prisma/seed.ts` deliberately does not
 * call this. Steward must never open on invented items.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PREFIX = "demo:";
const HOUR = 60 * 60 * 1000;

// Three categories, priorities deliberately out of insertion order so that
// reading them back in the right sequence proves the ordering rather than the
// insertion order.
const DEMO_ITEMS = [
  {
    externalId: `${DEMO_PREFIX}news-1`,
    source: "rss" as const,
    category: "news" as const,
    title: "Postgres 18 lands with asynchronous I/O",
    subtitle: "lwn.net",
    priority: 30,
    occurredAgoHours: 5,
    expiresInHours: 48,
  },
  {
    externalId: `${DEMO_PREFIX}systems-1`,
    source: "kuma" as const,
    category: "systems" as const,
    title: "Jellyfin has been down for 12 minutes",
    subtitle: "Uptime Kuma",
    priority: 0,
    occurredAgoHours: 0.2,
    expiresInHours: null,
  },
  {
    externalId: `${DEMO_PREFIX}inbox-1`,
    source: "capture" as const,
    category: "inbox" as const,
    title: "Ask the plumber about the basement valve",
    subtitle: "captured",
    priority: 20,
    occurredAgoHours: 2,
    expiresInHours: null,
  },
  {
    externalId: `${DEMO_PREFIX}systems-2`,
    source: "ha" as const,
    category: "systems" as const,
    title: "Home Assistant Core 2026.8.3 available",
    subtitle: "core only",
    priority: 10,
    occurredAgoHours: 20,
    expiresInHours: null,
  },
  {
    externalId: `${DEMO_PREFIX}news-2`,
    source: "rss" as const,
    category: "news" as const,
    title: "This one expired an hour ago and must not appear",
    subtitle: "expiry check",
    priority: 1,
    occurredAgoHours: 50,
    expiresInHours: -1,
  },
];

async function add() {
  const now = Date.now();

  for (const d of DEMO_ITEMS) {
    // upsert on (source, externalId) — the dedupe rule every adapter relies on.
    await prisma.item.upsert({
      where: { source_externalId: { source: d.source, externalId: d.externalId } },
      // Refreshes the display fields so re-running picks up edits here, but
      // leaves status and dismissedAt alone: a dismissed item stays dismissed,
      // which is the same guarantee a real adapter needs on its next run.
      update: {
        category: d.category,
        title: d.title,
        subtitle: d.subtitle,
        priority: d.priority,
      },
      create: {
        source: d.source,
        externalId: d.externalId,
        category: d.category,
        title: d.title,
        subtitle: d.subtitle,
        priority: d.priority,
        occurredAt: new Date(now - d.occurredAgoHours * HOUR),
        expiresAt: d.expiresInHours === null ? null : new Date(now + d.expiresInHours * HOUR),
      },
    });
  }

  console.log(`Added or kept ${DEMO_ITEMS.length} demo items.`);
  await list();
}

async function list() {
  const now = new Date();

  // The same read the queue page will use in step 4.
  const live = await prisma.item.findMany({
    where: {
      status: { not: "dismissed" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ priority: "asc" }, { occurredAt: "desc" }],
  });

  console.log(`\nQueue, in order (${live.length} live):`);
  for (const i of live) {
    console.log(`  ${String(i.priority).padStart(3)}  ${i.category.padEnd(14)}  ${i.title}`);
  }

  const hidden = await prisma.item.count({
    where: { expiresAt: { lte: now }, status: { not: "dismissed" } },
  });
  console.log(`\nExpired and correctly hidden: ${hidden}`);
}

async function clear() {
  const { count } = await prisma.item.deleteMany({
    where: { externalId: { startsWith: DEMO_PREFIX } },
  });
  console.log(`Removed ${count} demo items.`);
}

async function main() {
  const command = process.argv[2] ?? "list";

  if (command === "add") return add();
  if (command === "list") return list();
  if (command === "clear") return clear();

  throw new Error(`Unknown command "${command}". Use add, list or clear.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
