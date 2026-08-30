# Build plan

Ordered. Each step has an acceptance test, because "it renders" is not done. Steps marked **Vincent** are his to do and block the step after them.

This ordering differs from PRD §6 in one deliberate way: **the launcher moved from step 3 to step 12**, because it is the least valuable piece and the most tempting to start with. Everything else follows the PRD's sequence, with the skeleton split into the three steps below.

## 1. Skeleton

Two containers on WhiteTower, `app` and `db`. Next.js with TypeScript and Tailwind, shadcn/ui initialised, Prisma pointed at Postgres 16, `node-cron` started from `instrumentation.ts`, and a login. Copy the compose shape from `C:\Users\vince\Code\Horizon\docker-compose.yml`, minus its `jobs` service.

**Done when**: `docker compose up` serves an empty themed page on the LAN **behind a login**, `prisma migrate` runs clean, and a cron job logs a heartbeat once a minute from inside the app process. The heartbeat test is the one that matters: two lines a minute means the scheduler registered twice, and the same fault silently doubles every collector later.

Decided here: **auth, yes** — argon2id and an opaque session cookie, single user, Horizon's stack minus its roles. Superseded "probably none, since it is LAN only" when Steward became reachable over Tailscale. PRD §4, *Remote access*.

## 2. Design tokens and shell

Both palettes from `docs/DESIGN.md` as CSS variables on `:root` and `.dark`, `next-themes` wired with the `class` strategy, Inter and JetBrains Mono loaded, radius set to `0.625rem`. Sidebar and content frame with the eight nav items.

**Done when**: the shell matches the Home mockup in both themes and the toggle switches cleanly with no flash on reload.

Three deliberate departures from the mockup, all following from rule 2 — an empty panel is never rendered as a healthy one:

- **The level block says "Level —" and "not tracked yet".** There is no `Activity` table until step 11, so the mockup's "Level 7 / 9 of 18 left" would be an invented number in the one place the design says never to invent.
- **The Systems dot and the Family count are absent.** Both are live-data badges. A green dot before the Uptime Kuma adapter exists is exactly the false reassurance the staleness rule exists to prevent.
- **Sections without a page are disabled, not links.** A rail full of links that go nowhere teaches you to distrust the rail.

The theme toggle and sign-out sit in the rail above the level block rather than top-right, because the content header is the capture field's place from step 8.

## 3. Data model

`Item`, `SourceStatus`, `Activity`, `Setting` per `docs/ARCHITECTURE.md`. Unique constraint on `(source, externalId)`.

**Done when**: a seed script inserts a handful of items across three categories and they come back correctly ordered by priority.

## 4. Queue

The single prioritized list, rendered from the database. Dismiss writes `status` and `dismissedAt`. Expiry hides items past `expiresAt`. The empty state reads as an achievement, not a failed load.

**Done when**: dismissing an item removes it and it does not return on refresh; an expired item disappears without being dismissed; clearing every item shows the empty state.

Dismissal sets `status` rather than deleting the row. The adapter that produced the item would otherwise re-create it on its next run, since `(source, externalId)` would no longer match anything.

**The empty state has to become conditional in step 5.** Once collectors exist, an empty queue with a failing collector is a failed load wearing an achievement's clothes — precisely what the staleness rule exists to prevent. From then on it must read `SourceStatus` first and go amber rather than congratulate anyone. Until an adapter exists there is nothing that can be stale, so today an empty queue is simply empty.

## 5. The first adapter, Uptime Kuma

Prove the whole contract with the easiest source. Adapter, scheduler entry, `SourceStatus` writes, the gate card reading from it.

**Done when**: stopping a container turns the gate red within a minute and names the service; stopping Uptime Kuma itself turns the gate amber and says the collector is failing, not that services are down. **That second case is the one that matters** and it is what the whole staleness rule exists for.

Decided here: **`/metrics`**, after probing the live instance. No status page has any monitors on it, so the status-page route would have returned nothing and then silently missed whatever was left off it. `docs/ARCHITECTURE.md` carries the reasoning and the two costs.

The gate reads a new `Monitor` table rather than queue items. **Monitors-down as queue items is not in this step** — PRD component 1 includes it, and it arrives with a later pass once there is a roll-up rule, because a WhiteTower reboot must not produce fifteen queue rows.

## 6. Home Assistant adapter

Calendars, todos, `update.*`, persistent notifications, repairs. Feeds both the Today panel and the queue.

**Done when**: Today shows real events and tasks from HA, and an available Core update appears in the queue while HACS card updates roll up into one low-priority line rather than 14 items.

Decide here: which of the 18 calendars, and how `todo.home`'s 179 items get filtered to what is due.

## 7. Task tick

Ticking a task on Steward calls `todo.update_item` through HA.

**Done when**: ticking on Steward marks the task complete **in Todoist's cloud**, verified in the Todoist app rather than in HA. If it only updates HA's local copy, stop and re-plan this feature.

## 8. Quick capture

A box that writes to Steward's own inbox, and the three triage actions: make a Todoist task, append to a vault file, drop.

**Done when**: a captured thought appears in the queue as an inbox item, and each of the three actions clears it correctly. The vault append lands at the end of the target file and does not produce a Syncthing conflict copy.

## 9. Feed list (**Vincent**)

The RSS sources and topic definitions: sites, YouTube channels (`/feeds/videos.xml?channel_id=`), Steam per-game feeds. Nothing to inherit; the Feedparser integration in HA has no feeds configured.

**Blocks step 10.**

## 10. News

RSS collector into a staging table, hourly. A daily ranking job at 06:00 that promotes the top few per topic into the queue and discards the rest unseen.

**Done when**: the queue gains a handful of news items each morning and never more; a day with nothing interesting produces nothing rather than filler.

## 11. Base game layer

`Activity` rows on clear and tick. Level derived. The "remaining this week" bar in the sidebar, draining.

**Done when**: clearing items moves the bar down, the level is derived rather than stored, and nothing anywhere displays an accumulated score.

## 12. Launcher

The full tile grid. Trivial, and deliberately last because it is the least valuable and the most tempting to start with.

## Carried debt

Things the PRD requires that no step above owns. Listed here so they are debt rather than drift, and none of them may be outstanding when the trial starts.

- **Auto-refresh.** PRD §4: "It must stay true while left open all day. Auto-refreshing, not a morning snapshot." `@tanstack/react-query` is in the stack for this and nothing polls yet, so every panel is only as current as the last manual reload. Noticed while testing step 5, where a red gate needed a hand-reload to appear. Cheapest correct fix is a client poll on the panels that carry an "as of", at something near each collector's interval.
- **Monitors down as queue items.** PRD component 1 is "Panel (health) plus queue (… monitors down)". Step 5 built the panel only. The queue half needs a roll-up rule first: a WhiteTower reboot takes fifteen monitors down at once and must produce one row, not fifteen — the same lesson as step 6's HACS cards.

## 13. Six-week trial (**Vincent**)

**No new sources during it.** The success test, from the PRD: real things moved, nothing homeless, opened most days, stopped fiddling with the system, the tour measurably shrank, and nothing was ever silently wrong.

One thing to watch rather than measure, carried over from the relationships work: whether seeing the last-contact numbers changes how the calls feel. If it does, that panel changes.
