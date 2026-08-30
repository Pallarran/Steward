# Architecture

## The adapter contract

Steward pulls from seven unlike sources. That is the whole risk in the project, and this contract is what contains it.

Every source is one module exposing exactly two things:

```ts
type Adapter = {
  key: SourceKey            // 'ha' | 'rss' | 'kuma' | 'unraid' | 'horizon' | 'vault' | 'gmail'
                            // the schema adds 'capture': quick capture is not
                            // an adapter, but its items still need a provenance
  intervalSeconds: number
  fetch(): Promise<NormalizedItem[]>
}
```

Rules, in order of importance:

1. **Adapters write to the database. The UI reads only the database.** No adapter is ever called from a page, a server component or a route handler that renders. A dead source cannot break the page; it can only go amber.
2. **Errors are isolated per source.** The scheduler wraps every run in its own try/catch and records the outcome. One adapter throwing must never stop the other six, and must never crash the app process.
3. **Every run records its outcome**, success or failure, with a timestamp. That record is not logging. It is the data that drives the amber state in the UI.
4. **Normalize at the edge.** Adapters emit one shape. Nothing downstream knows or cares where an item came from.
5. **Dedupe on `(source, externalId)`.** Every adapter must produce a stable external id. For RSS use the entry guid or the URL; for HA use the entity id plus the relevant timestamp; for Uptime Kuma use the monitor id plus the incident start.
6. **Poll, do not subscribe.** Conditional requests where the source supports them (ETag, If-Modified-Since) and exponential backoff on failure. Webhooks and websockets are more efficient and much more fragile, and Steward reads every few minutes.

## Data model

Sketch, not a migration. The Prisma schema for these four is step 3 of the build plan; step 1 lands only `User`, `Session` and `Setting`.

**`Item`** is the queue. One row per thing that arrived.

| field | notes |
|---|---|
| `id` | cuid |
| `source` | which adapter produced it |
| `externalId` | stable per source, unique with `source` |
| `category` | drives the coloured chip: `systems`, `school`, `couple`, `news`, `gaming`, `subscriptions`, `inbox` |
| `title` | one line, shown at 14px |
| `subtitle` | the dim second line |
| `url` | where clicking through goes, nullable |
| `priority` | integer, sets the order of the single prioritized list. **Ascending: 0 sits at the top.** Nothing renders the number — position carries the priority |
| `occurredAt` | when the thing happened at the source |
| `expiresAt` | nullable; news gets ~48h, most things get none |
| `status` | `new` / `seen` / `dismissed` |
| `dismissedAt` | nullable |

**`SourceStatus`** is one row per adapter, and it is what the staleness rule reads.

| field | notes |
|---|---|
| `source` | primary key |
| `intervalSeconds` | how often it should run |
| `lastSuccessAt` | drives "as of" |
| `lastErrorAt`, `lastError` | drives amber, and the message shown |

**`Activity`** is the base game layer. One row per thing Vincent did.

| field | notes |
|---|---|
| `kind` | `cleared` / `ticked` / `filed` |
| `itemId` | nullable |
| `points` | integer |
| `createdAt` | timestamp |

Level and "remaining this week" are both derived from this table. Nothing stores a score.

**`Setting`** is a key/value table for theme and anything else per-user.

**`User`** and **`Session`** exist because Steward has a login (PRD §4, *Remote access*). `User` is Horizon's model stripped to `id`, `email`, `passwordHash`, `displayName`, `mustChangePassword`, `lastLoginAt`, `createdAt` — no roles, no household, no locale. `Session` is Horizon's verbatim: an opaque random `token`, `expiresAt`, `userAgent`, `ipAddress`, indexed on `userId` and `token`.

There is exactly one user, and nothing else in the schema is scoped to them. Horizon's `scopedPrisma` layer is deliberately not copied: with one user it would be ceremony that hides queries without protecting anything.

## Collector intervals

| adapter | interval | notes |
|---|---|---|
| Uptime Kuma | 60s | drives the gate |
| Home Assistant | 5 min | calendars, todos, updates, notifications, repairs |
| Horizon | 15 min | v2 |
| RSS | 60 min | into a staging pool, not into the queue |
| Vault | 15 min | reads planner files; v2 |
| Daily ranking | 06:00 | promotes staged news into the queue |

**The queue gets curated output, never raw feeds.** A dozen feeds produce hundreds of items a day. They land in a staging table the ranker reads; the top items become `Item` rows; the rest are discarded unseen. Raw articles in the queue would make clearing it a chore and turn Steward into one more surface to tour.

## The cloud boundary

Personal data stays on the LAN. The split is by sensitivity, not convenience.

- **Public data only leaves the house**: news and gaming headlines, and later ticker symbols. The daily ranking runs as a Cowork scheduled task against cloud Claude and receives titles and URLs, nothing else.
- **Personal data never leaves**: Home Assistant, tasks, calendars, school, and later Gmail. Handled locally by rules, or by Ollama on the RTX 3060 if a step needs judgment.
- Dollar figures never leave, even when ticker symbols do.

## Secrets and network

One `.env`, never committed.

| var | from | notes |
|---|---|---|
| `DB_PASSWORD` | `openssl rand -base64 24` | compose assembles `DATABASE_URL` from it; never set `DATABASE_URL` directly on the server |
| `ALLOW_HTTP` | `"true"` | secure cookies are off while Steward is reached over plain HTTP on the LAN. Turn it off the day every route in is HTTPS |
| `SEED_EMAIL`, `SEED_PASSWORD` | you | consumed once by `prisma/seed.ts`, then dead |
| `HA_BASE_URL`, `HA_TOKEN` | step 6 | |
| `KUMA_BASE_URL`, `KUMA_KEY` | step 5 | |
| `HORIZON_BASE_URL` | v2 | |

**No session secret.** Sessions are opaque random tokens stored in the database and matched on lookup, so there is nothing to sign. Horizon carries a `SESSION_SECRET` in its compose file and its deployment guide but no code in it reads the variable; Steward does not copy the mistake.

Served on the LAN, reached from outside through Tailscale. See PRD §4, *Remote access*, for why a Cloudflare Tunnel is not recommended and what it would need if it is added anyway.
