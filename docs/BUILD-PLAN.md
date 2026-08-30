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

## 6. Todoist adapter, read and tick

**Reordered 2026-08-30.** Tasks come from the Todoist API directly rather than through Home Assistant — PRD §3.2 carries the reasoning. Reading and ticking land in the same step, because the write is the risky half and proving it early is the whole point of doing it first.

`GET /api/v1/tasks` filtered to what is genuinely due, into the queue and the Today panel. Ticking calls `POST /api/v1/tasks/{id}/close`.

**Done when**: ticking a task on Steward marks it complete **in the Todoist app**, and the task does not come back on the next poll. 179 tasks produce a handful of rows, not 179.

Decided here, from probing the live account rather than guessing:

- **Due means `due.date` on or before today**, overdue included, compared as a calendar day in `America/Toronto`. Of 188 active tasks that is 15 — 8 overdue, 7 due today. Priority is not part of the filter: a third of the account sits at the API's highest priority, so it does not discriminate.
- **Two projects exist, Home and Inbox.** All 13 Inbox items become queue rows, as PRD component 4 says. Vincent chose this over a count badge, having heard the objection that the queue then opens at 13 rows before any other adapter contributes, and that "working it to empty" is the mechanic the whole thing rests on. None of the 13 are due, so nothing is counted twice.
- **Home tasks are filtered to the `Vincent` label.** The Home project tags every task with a family member — Naomi, Annabelle, Marylene, Vincent — and nothing there is untagged, so there is no ambiguous case. That takes the Today card from 15 to 6. The adapter checks the label still exists and **fails loudly if it does not**: filtering on a renamed label would match nothing and the card would say "Nothing is due today", which is a lie. An amber panel is the honest outcome.
- **A task shared with someone else still shows, marked with whom.** Carrying the `Vincent` label is what puts it on the card; carrying another family member's too makes it shared, and the row says "shared with Marylene" in the family purple rather than presenting it as his alone. Three of the fifteen due tasks are shared.
- **The Inbox is not label-filtered**, being Vincent's by definition, and Inbox tasks are excluded from the Today card so the two surfaces stay disjoint.
- **Tasks are ticked, never dismissed** — rule 3 — including the Inbox rows in the queue, which get a tick rather than an X.

Two things the live API contradicted about its own documentation: task objects carry **no `url` field** in v1 (188 of 188), so the link is constructed; and **no task carries a time**, only a date, so the Today card shows "today" or "late" rather than a clock.

## 7. Home Assistant adapter

Calendars, `update.*`, persistent notifications, repairs. Feeds both the Today panel and the queue. **No todos: those come from Todoist now.**

**Done when**: Today shows real events from HA, and an available Core update appears in the queue while HACS card updates roll up into one low-priority line rather than 14 items.

Decided here, from probing the live instance rather than reading names:

- **`calendar.home` and `calendar.inbox` are excluded as Todoist mirrors.** The Home Assistant Todoist integration publishes a calendar per project, and all 28 of `calendar.home`'s events in the window matched a Todoist task by exact title. Including them would have shown every task twice.
- **Their own line, not events**: `meal_plan` (tonight's supper), `garbage` and `recycling_and_compost` (next collection, emphasised when it is today or tomorrow), `school_day` (tomorrow's cycle number — the events are literally "1", "2", "3").
- **Events**: `vincent`, `family`, `couple`, `both_girls`, `annabelle`, `naomi`, `school`, `canada`, `cleaning`, plus `marylene` **marked as hers**. Vincent's call: her 07:45 transport runs shape his morning whether or not the errand is his.
- **Out of v1**: `birthdays` and `anniversaries`, which the PRD puts in v3.
- The adapter **fails loudly if any configured calendar is missing**, for the same reason the Todoist label check exists.

**The update roll-up splits on the `title` attribute**, which the data supports rather than name-matching: of 58 `update.*` entities, the 10 carrying a `title` are Core, the OS, the Supervisor and the add-ons, and the 48 without are HACS cards, HACS integrations and device firmware. Named ones get their own row at priority 10; the rest become one row at priority 40, whose id is a digest of exactly which entities are in it — so dismissing "3 waiting" does not also hide "7 waiting" next week.

**Not testable on the day it was built**: 0 updates were pending and 0 notifications existed, so the queue half shipped unproven. It needs confirming the next time Home Assistant actually has an update.

The roll-up rule built here is the one the monitors-down debt is waiting on — the same problem in a different costume.

## 8. Quick capture

A box that writes **straight into Todoist's Inbox**, and appears in the queue at once as a Todoist Inbox row.

**Done when**: a captured thought is in Todoist's Inbox and on the queue within a second, ticking it completes it in Todoist, and a capture attempted while Todoist is unreachable comes back with the text still in the box.

**Steward keeps no inbox of its own.** Changed 2026-08-30, Vincent's second call on this step and the better one: Steward's inbox and Todoist's were the same idea in two places, and the "make a task" button existed only to move between them. Removing one destination removed a source of truth, a triage action, a queue-row variant and the question of where kept captures live — they live in Todoist's Inbox, where he already triages.

The row is written from the create response rather than waiting for the next poll, so it appears immediately, and it carries the real Todoist id so the poll upserts the same `(todoist, externalId)` and changes nothing. On failure the text is returned to the box: losing a thought is the one thing a capture box may never do.

The `capture` value in `SourceKey` is now unused. Left in place because removing an enum value in Postgres is more disruptive than the tidiness is worth.

**The vault action is cut.** Changed 2026-08-30 at Vincent's decision: he would rather captures be logged in Steward and processed there than written into `Cowork-OS`. Two consequences, both good — there is no vault bind mount at all, so the regulatory question of Steward being able to reach `Work-HQ` never arises; and the whole step needs no filesystem access.

**Kept captures have no home, deliberately.** Vincent chose that a capture simply stays in the queue until it becomes a task or is dropped, over a separate page to review them on. Recorded because it has a cost he accepted: a capture he is not ready to decide about keeps the queue from reaching empty, and the empty state is the achievement the daily loop is built around. If the queue starts feeling like a backlog rather than a day's work, this is the first thing to revisit.

**Parked, not built:** "launch a conversation with Claude" from a capture. Not in the PRD, and a genuinely new component rather than a triage action. Needs the PRD updated before anyone builds it.

## 9. Topics and sources, managed

**Rewritten 2026-08-30.** This was "Vincent writes the feed list", a one-sitting data-entry step that blocked step 10. Vincent asked for the infrastructure instead, so feeds and topics can be added and removed as he finds them — which is right: a list written once rots, because sites die, channels move and interests change faster than either.

`Topic`, `Feed` and `Article` tables, and a **Settings page** reachable from a gear in the rail beside the theme toggle and sign-out. Chrome, not a destination, so it is not one of the eight nav items.

**Adding a source is pasting any URL.** A site's homepage, a YouTube channel, a Steam store page. Steward resolves it — `<link rel="alternate">`, then the conventional paths for sites that publish a feed without advertising it; the canonical channel id for YouTube; the appid for Steam — and then **fetches the result and parses it before saving**. A source that does not work is never added.

Two things that verification caught, which reasoning would not have:

- `@Level1Techs` resolved to **a different channel**, because a bare `channel/UC…` match finds recommended channels elsewhere in the page. Now only the canonical link, `og:url` or `externalChannelId` are trusted, and failing is preferred to guessing.
- Ars Technica publishes a feed but does not advertise it, so the usual paths are tried before giving up.

**Every feed carries its own health** on the page — collected count, last success, last error — because rule 2 applies per source: a feed that has been 404ing for a month must say so rather than quietly making its topic look thin.

**Done when**: pasting a site, a YouTube channel and a Steam game each add a working feed, a bad address is refused with a reason, and muting a feed keeps its address.

**No longer blocks step 10**, which now reads enabled feeds from the database instead of a config file.

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

- ~~**Auto-refresh.**~~ **Done 2026-08-30.** `AutoRefresh` in the `(app)` layout calls `router.refresh()` every 60 seconds while the tab is visible, and immediately when it becomes visible again — the case that actually matters, a tab left open for hours. Deliberately **not** React Query, which `CLAUDE.md` names for polling: that assumes client components calling API routes, while these are server components reading Postgres directly, so it would mean an API surface and duplicated state to solve what the router already solves. React Query is consequently still an unused dependency; leave it until something genuinely interactive needs it, then use it or drop it.
- **Monitors down as queue items.** PRD component 1 is "Panel (health) plus queue (… monitors down)". Step 5 built the panel only. The roll-up rule now exists in the Home Assistant adapter, so this can be finished by reusing it.
- **Persistent notifications and repairs.** PRD component 1 names both. Neither is reachable over the REST API: `persistent_notification.*` returns 0 entities on this instance and `/api/repairs/issues`, `/api/config/repairs` and `/api/issues` all 404. Both live behind Home Assistant's **WebSocket** API, and `docs/ARCHITECTURE.md` rule 6 says poll rather than subscribe. Deferred rather than smuggled in through a second connection style; revisit as a deliberate exception if they turn out to matter.
- **The update queue rows are unproven.** Nothing was pending when they were built.

## 13. Six-week trial (**Vincent**)

**No new sources during it.** The success test, from the PRD: real things moved, nothing homeless, opened most days, stopped fiddling with the system, the tour measurably shrank, and nothing was ever silently wrong.

One thing to watch rather than measure, carried over from the relationships work: whether seeing the last-contact numbers changes how the calls feel. If it does, that panel changes.
