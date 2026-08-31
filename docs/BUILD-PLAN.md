# Build plan

Ordered. Each step has an acceptance test, because "it renders" is not done. Steps marked **Vincent** are his to do and block the step after them.

This ordering differs from PRD §6 in one deliberate way: **the launcher moved from step 3 to step 13**, because it is the least valuable piece and the most tempting to start with. Everything else follows the PRD's sequence, with the skeleton split into the three steps below.

**The rule the ordering follows, from step 10 onward: a component is finished, page included, before the next one starts.** Vincent's call on 2026-08-30, and it is why Systems became a step of its own rather than a bullet after News. Ordering by size builds breadth on top of unfinished depth, and the half-built thing stays half-built. A component's carried debt closes in its own step for the same reason.

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

**The update roll-up splits on attributes rather than on matching names.** Refined in step 10 from two groups to four, after the mockup's "Core / Add-on / HACS card" rows turned out to need a finer split than `title` alone could give. Of 58 `update.*` entities: **3 system** (the canonical `update.home_assistant_{core,operating_system,supervisor}_update` ids), **7 add-ons** (a `title`, no `release_url`), **42 HACS** (a github `release_url`, no title), **6 device firmware** (neither). 3 + 7 + 42 + 6 = 58.

Matching the three system ids is not name-guessing: they are fixed identifiers the Supervisor generates, and no attribute separates the platform from an add-on. The obvious alternative — "a title *and* a release_url" — breaks the day an add-on declares a release URL, and a title-prefix test breaks on an add-on genuinely called "Home Assistant Google Drive Backup".

The three system entities get their own queue row at priority 10, because which one is waiting changes what you do about it. The other three groups each become **one** rolled-up row — 30, 40, 45 — so a full update day is at most six rows rather than fifty-five. Each rollup id is a digest of exactly which entities are in it, so dismissing "3 waiting" does not also hide "7 waiting" next week.

**The Systems page reads a fact, not these rows**, so that dismissing an update in the queue does not make the page claim it is installed.

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

## 10. Systems, finished

**Added 2026-08-30**, at Vincent's call: a component is not done until its page is. Systems had two collectors, a gate card and a dead label in the rail, and the next step was going to be News. Ordering by size builds breadth on unfinished depth.

The page needs no new collector and no migration. Everything on it is data three adapters already write.

`/systems` — the services list, the Home Assistant section, a **Collectors** section, and links out. Plus the rail's Systems dot, the `whitetower` sub-label, and the **stat row** on Home that `docs/DESIGN.md` has specified since step 2.

**Done when**: stopping a container turns the rail dot red, names the service on `/systems` and puts one row in the queue; bringing it back removes that row without a dismissal; stopping Uptime Kuma turns the dot amber and the page blames the collector; the Collectors section names the failure in words.

Decided here:

- **Uptime durations are not shown.** The mockup drew "31d up". `/metrics` carries no incident history, so `changedAt` is only ever *when Steward watched it change* — on a monitor that has only ever been up, that is when Steward first looked. Down says how long, up says "up".
- **Notifications and repairs are shown as not connected, not as "none".** They remain WebSocket-only. Rendering a zero for a check that never ran is a check that never ran wearing the clothes of a check that passed, and it is the most comfortable possible lie.
- **Unraid's block is absent with a reason**, not a green tile.
- **The Systems page ignores dismissal.** The queue asks "does this need you?"; this page asks "what is true?". An update waved past in the queue is still an update that is waiting.
- **Unavailable entities are a `Setting` fact, not an `Item`.** Current state that resolves itself, and one number does not earn a model. If a second such fact appears, both move to a `SystemFact` table rather than a third key being added.
- **Monitors down become queue rows here**, closing the debt step 5 opened. The Home Assistant roll-up rule is reused: three or more at once become one row whose id is a digest of exactly which ones. **The row is deleted on recovery rather than waiting to be dismissed** — a service being down is not "gone, true and final", so rule 3 does not let dismissal be the thing that clears it. Dismissing one means "I know, I am on it".
- **Three stat cards, not four.** The fourth is the portfolio, which needs Horizon in v2. An empty slot advertising something Steward cannot show is worse than three real numbers.

**One defect found while building it.** The Home Assistant adapter never removed an update row once the update was installed: HA stops reporting it, the upsert stops touching it, and "Core 2026.8.1 is available" would have sat in the queue forever. Invisible as a queue line, obvious as a *fact* on a page — which is an argument for the page. Fixed by pruning `ha` systems items absent from the run.

**Reordered 2026-08-30, at Vincent's call**, after step 11a shipped. The 06:00 ranking and the whole game layer moved to the end: *"I'd rather have a complete app before starting to decide what is linked to the gamification and what isn't."* Both are genuinely **new** things rather than replacements for something he already tours, and everything else in v1 is a replacement. So the aggregation surfaces and the hardening finish first, and the two new mechanics land last, against a complete app. That is the depth-before-breadth rule applied to the product rather than to a component.

## 11. News: collector and page

RSS collector on the hour with **conditional requests** — `ETag` and `If-Modified-Since`, unlike Kuma's metrics, because a feed body genuinely is identical between polls. Per-feed try/catch, so one 404ing feed writes its own `lastError` and the rest still collect; the source goes amber only when not one feed could be read.

`/news` groups unread articles by topic. **Opening one marks it read**, because opening it is reading it and a second control afterwards would be bookkeeping; rule 3 permits this here and almost nowhere else, since a read article is genuinely gone. The X is for "headline seen, not reading it".

**Done when**: every enabled feed shows a collected count on `/settings`; `/news` groups real articles and reading one clears it for good; a feed pointed at a dead host shows its error while the others still collect.

Decided here:

- **`createMany` with `skipDuplicates`, not an upsert per entry.** An upsert would rewrite every existing row every hour on every feed to change nothing. The cost is that a headline edited after publication keeps its original wording — and `readAt` and `promotedAt` become untouchable by construction rather than by remembering.
- **Conditional requests are best-effort.** Measured: `dndbeyond.com` sends no `ETag`, regenerates `Last-Modified` per request, and returns 200 to a conditional carrying its own timestamp back. A feed that answers "0 unchanged" forever is not a bug. `docs/ARCHITECTURE.md` carries the detail.
- **A generic feed title is replaced at render with the hostname.** That feed is titled, literally, "Posts", so every row read "Posts · 2 hours ago". Applied at render rather than at add time, so it fixes feeds already saved and leaves the stored title honest.
- **"Mark all read" is undoable**, which is what makes it pressable — Vincent's words were "scared to test it". Every article in a batch shares one `readAt`, which makes the batch addressable, and the undo matches that exact timestamp.

## 12. Launcher

The full tile grid. **Tiles live in `Setting` and are managed on `/settings`, not committed** — the repo is public and every tile is a LAN address. That also retired the data-entry debt this step used to carry: there is no list to hand over, Vincent adds tiles as he finds them, exactly as step 9 established for feeds.

A tile may name an Uptime Kuma monitor and carry its status dot, which is the one thing Homepage does well and is free here. **The dot disappears entirely when the Kuma collector is behind** rather than showing the last state it saw. A launcher is the surface used in a hurry, and it is the worst possible place for a green dot on a dead service.

**Done when**: every tile opens the right app; a bound tile shows real status; adding one needs no deploy; `git grep 192.168` finds nothing.

Decided here:

- **A tile's address is not fetched before saving**, unlike a feed's. A feed is something Steward reads on a schedule and is worth proving; a tile is a link Vincent clicks, and half these services are asleep or behind Tailscale, so a reachability test would refuse perfectly good tiles for being off at that moment.
- **The icon is the service's own favicon, loaded by the browser**, falling back to the initial. His browser is already on the LAN or the tailnet; routing it through `next/image` would make the *server* fetch and cache every icon — a round trip and a disk for something the browser already has, and one that fails for anything only the browser can reach.

## 13. Hardening

Before the trial, not after, because the trial is what tests whether Steward is trustworthy.

**Nightly housekeeping at 03:00.** Nothing else in Steward deletes anything: every adapter upserts, the queue marks rather than removes, and articles arrive hourly forever. `src/lib/housekeeping.ts` clears read articles after a week, unread and unpromoted ones after a month, expired sessions, dismissed items after 90 days, and live-state rows an adapter stopped seeing. Every window is deliberately generous — keeping a row a week too long costs nothing, deleting one a day early costs a headline he had not read. It is **not an adapter**: it reads no source and has no panel, so it writes no `SourceStatus` and cannot make anything go amber. Its failure mode is a database that grows, which is a slow problem rather than a wrong one.

**A nightly `pg_dump` to the array**, `scripts/backup.sh`, run from Unraid's User Scripts. Four things exist nowhere else: the dismissal state, the topics and feeds, the launcher tiles, and the login. It refuses a dump under 10 KB, and prunes only after a good one lands — a failing backup must never also be the thing that deletes the last working one. `DEPLOYMENT.md` carries the setup and the restore.

**`vitest` over the pure functions**, 31 tests in under a second: Kuma's metrics format including the response-time join and its `Nan`, RSS and Atom parsing, and the `America/Toronto` logic behind "due today" across midnight and both sides of the daylight-saving change. Every one of these was verified once by deploying it and looking at the screen, which proves it worked that day and protects nothing afterwards.

**The health endpoint was cut**, 2026-08-30. Vincent's objection — "using Steward to know if Steward is up is running in circles" — was answered in part: it would be Uptime Kuma, a separate container, doing the watching, so there is no circle. But he was right that the endpoint is not worth building, for a reason worth recording: **Kuma can already watch Steward's existing URL with no code at all.** A dedicated health route would only add "and the database answered too". Add the monitor, skip the code.

## 14. The two new mechanics

Last, deliberately, against a finished app.

**The 06:00 ranking**, promoting at most 3 per topic and 8 overall into the queue with a 48h expiry. **It runs inside Steward against the Claude API** — decided 2026-08-30, superseding the PRD's Cowork scheduled task, which needed Steward to expose an authenticated API, a shared key and a second scheduler whose failures Steward's own staleness rule could not see. One more secret buys all of that back. The cloud boundary is unchanged: titles, URLs, feed names and topic names go out, and nothing else ever did. Needs `ANTHROPIC_API_KEY`, and needs more than one source across more than one topic before the per-topic rule has anything to do.

**The base game layer.** `Activity` rows on clear and tick. Level derived, never stored. The "remaining this week" bar in the sidebar, draining. The queue's cleared state gains the day's counts.

**The weekly target is Vincent's, not the system's.** PRD §6's first gamification rule is that he sets his own thresholds and the system never assigns them — the trial closest to this design found only the self-chosen arm worked. So the target is a `Setting`, and until he sets one the level block keeps saying "not tracked yet" rather than inventing a denominator.

**Done when**: a manual rank puts at most eight real headlines in the queue and never the same article twice, and an empty pool produces zero rows and a clean success; clearing items moves the bar down; the level is derived rather than stored; nothing anywhere displays an accumulated score.

## Carried debt

Things the PRD requires that no step above owns. Listed here so they are debt rather than drift, and none of them may be outstanding when the trial starts.

- ~~**Auto-refresh.**~~ **Done 2026-08-30.** `AutoRefresh` in the `(app)` layout calls `router.refresh()` every 60 seconds while the tab is visible, and immediately when it becomes visible again — the case that actually matters, a tab left open for hours. Deliberately **not** React Query, which `CLAUDE.md` names for polling: that assumes client components calling API routes, while these are server components reading Postgres directly, so it would mean an API surface and duplicated state to solve what the router already solves. React Query is consequently still an unused dependency; leave it until something genuinely interactive needs it, then use it or drop it.
- ~~**Monitors down as queue items.**~~ **Done 2026-08-30**, in step 10, where it belonged — it is systems debt, and a component's debt closes with the component rather than in a later cleanup pass.
- **Persistent notifications and repairs.** PRD component 1 names both. Neither is reachable over the REST API: `persistent_notification.*` returns 0 entities on this instance and `/api/repairs/issues`, `/api/config/repairs` and `/api/issues` all 404. Both live behind Home Assistant's **WebSocket** API, and `docs/ARCHITECTURE.md` rule 6 says poll rather than subscribe. Deferred rather than smuggled in through a second connection style; revisit as a deliberate exception if they turn out to matter.
- **The unavailable-entity count needs reworking.** Kept for now at Vincent's call, and flagged here rather than left to be rediscovered. It does not work on this instance: filtering out media players, remotes and phones took 63 down to 43, and the 43 are roughly *one* dead Wyze camera wearing twenty entities, three iPhones' companion entities, two add-ons that are not running, six lights that are probably off at the wall, and `camera.front_doorbell` — which is the only one that looks like a real fault. Grouped by device it would still read about fifteen every day, and fifteen every day is wallpaper: it trains you to ignore the panel, which is the failure rule 2 exists to prevent. **The version that would work is a diff** — what stopped answering since the last run, rolled up by device — with a decision about what happens when Home Assistant restarts and everything blinks at once. Not a filter problem; a unit problem.
- **Uptime duration or percentage on a service tile.** Parked by Vincent on 2026-08-30 — the response time Steward shows instead is honest but not what he wants, and the mockup's "31d up" and Kuma's own 24-hour percentage are both better. **Neither is reachable on the current read path.** `/metrics` publishes status, response time and certificate days, and no uptime figure at all; `changedAt` is only ever *when Steward watched it change*. The two candidates are Kuma's `/api/badge/<id>/uptime/24`, which needs a numeric monitor id that `/metrics` does not expose, and its socket.io API, which `docs/ARCHITECTURE.md` rule 6 rules out. So this is not a small fix: it needs a second read path into Kuma, and that is a deliberate exception to be argued rather than slipped in.
- **The update queue rows are still unproven.** Nothing was pending when they were built, and nothing has been since. Step 10 found and fixed one defect in them by reading rather than running — the rows were never removed once an update was installed — but the create path has still never been seen with real data. Confirm the next time Home Assistant actually has an update.

## v2. Finance

**Started 2026-08-31**, ahead of the trial, at Vincent's decision to add the remaining pages before the two new mechanics. Recorded because PRD §7 decision 4 says the opposite — *"the trial decides what v2 becomes"* — so these are being built on judgement rather than on evidence from use.

Checking which of the four v2 pages were actually buildable found that **all four were blocked**, and one of the blockers was a factual error in the PRD:

- **Finance.** The PRD says "Horizon API (running)". It was not. Horizon had six route handlers, none returning financial data, and **no non-browser authentication of any kind** — every figure was computed inside a server component and never serialised. Buildable, but it started in the other repo.
- **Family.** The artboard reads `Couple-Activity-Planner.md` from the vault, and vault access was deliberately removed so the regulatory question about `Work-HQ` could never arise. Needs that decision reversed, or the planner moving into Steward.
- **People.** Needs the people list and an intention per person. The PRD: *"No software fills these."*
- **Documents.** Needs Paperless populated, which the PRD calls *"The real project."*

**In Horizon**: `GET /api/summary`, aggregates only, behind a shared key that serves nothing when unset. Plus `loadPortfolioInputs`, extracted from the dashboard page so the endpoint and the dashboard cannot compute a different net worth from the same data — the cash total is subtle enough that a copy of it would eventually drift, and two surfaces disagreeing about how much money there is would be the worst kind of silent wrongness.

**In Steward**: the `horizon` adapter at 15 minutes, `/finance`, and the fourth stat card the mockup always had.

Decided here:

- **`SystemFact` finally exists.** Horizon is the second source to write a fact, which is exactly the threshold `docs/ARCHITECTURE.md` set for promoting them out of `Setting`. Following a rule written the previous day rather than revising it a second time to avoid the work.
- **Two clocks, because they answer different questions.** `pricesAsOf` says whether Horizon's fetch is healthy; `priceDate` says what market day the figures describe. Horizon fetches on weekdays only, so on a Sunday it can be perfectly healthy and still holding Friday's close. The panel dates itself by the market day and says "at last close" rather than "today". **This is the easiest rule-2 failure in the whole app to ship by accident**, because everything about the collector looks fine while the number is two days old.
- **The endpoint is narrow on purpose.** Steward cannot leak holdings or transactions because it never receives them.

## v2. People

Steward owns this list outright. There is no source to collect from — the PRD is blunt that "no software fills these" — and the answer is that Vincent fills it in Steward, the way he fills in feeds and tiles. That reframes the data-entry debt: it is not a sitting to schedule, it is a page to use.

**Managed on `/people`, not in settings.** A feed configures the News page and a tile configures the launcher; a person *is* the content. Adding one belongs where you look at them.

**Recording contact is undoable**, keeping the previous date on the row. Without that, one mis-tap silently destroys the real date, and this list exists nowhere else to recover it from — the same lesson as "Mark all read", which Vincent said he was scared to press.

**One row per overdue person, never a roll-up.** "3 people are overdue" is a statistic about your relationships, which is precisely what PRD §6 warns turns them into work. A row naming one person and suggesting one call is an action. Priority 60, below the day's real business: a relationship nudge is an invitation, and putting it at the top would make it a demand. The row is **deleted when the call is recorded**, not left to be dismissed — waving it away means "not today", and it comes back, because it is still true.

**Nothing counts anything up.** No streak, no monthly total, no score, and a bar rather than a number on the row — the distinction §6 draws between a progress display, which helps, and a counter, which does the damage. **This stays out of the XP economy when the game layer arrives.**

**No default cadence.** §6's first rule is that Vincent sets his own thresholds and the system never assigns them, so blank means no nudge ever and that is a real choice rather than an unfinished form.

The §2 watch item now has something to watch: whether seeing these numbers changes how the calls feel. If it does, this page is the thing that changes.

## v2. Family, the couple planner

**Steward owns this**, decided 2026-08-31, superseding PRD §5's finding that the dashboard should read `Couple-Activity-Planner.md` rather than replace it. Vincent's division, and a cleaner one than the document had: **Cowork stays where he explores ideas and works out a plan; Steward holds what is parked and what is booked**, so there is always a view and a nudge.

I had recommended the opposite — a read-only mount of `Family-HQ` alone, on the grounds that the file is genuinely good and Obsidian is where he reads. He was right and I was not: the vault is a document you have to open, and what he wanted was the thing that tells him December is still empty.

Three consequences, all good. The **vault stays unmounted**, so the `Work-HQ` question never arises here either. **No markdown parsing**, so renaming a heading cannot silently empty a panel — which was the real cost of my version. And the per-girl planners stop being files that must exist before anything works.

`CoupleSlot` and `Idea`, and `/family`. Decided here:

- **The alternating rule is stored, not derived.** Marylène takes odd months and Vincent even ones, but the planner's own text says they give each other slack, so the month's owner is a field that defaults to the rule and can be changed.
- **The nudge is only for Vincent's months.** Nudging him about hers would be nagging her through him, which is not what a shared planner is for.
- **The subtitle counts the ideas waiting**, because the answer to an open slot is usually already parked — it turns the row from a reminder into something actionable.
- **An open month of his shows the bank inline**, so choosing is one click rather than a copy and a paste. Using an idea sets `usedAt` rather than deleting it: the bank shows what is still available without losing what was used.
- **Two months of horizon.** The planner's own goal is to plan in advance, not in the last week.
- The row is **deleted once the slot stops being open**, like every other nudge here.

**One on one**, built from the artboard's structure rather than its text — the lesson from getting the Systems layout wrong by reading only the words. The page is two columns: the couple plan and its bank fill the width, and *One on one* sits in a fixed right column, at the 340px the Today card uses on Home rather than the artboard's 400px, so the two pages agree.

A girl's card asks the two questions the artboard asks: is something planned, and if not what is in her bank. Deliberately simpler than the couple planner — there is no alternating cadence to honour.

- **Each girl has her own bank**, sharing the `Idea` model scoped by `kidId`; null is the couple's. Her ideas appear as buttons on her card exactly when she has no plan, which is the moment a bank is for.
- **"We did it" clears the plan** and records when, using the plan's own date where there is one — a Saturday marked done on Monday happened on the Saturday. The card then shows what is next rather than what already was.
- **The nudge fires on "no plan past the mark he set"**, never rolled up. "2 girls need time with you" is a statistic about his children; the point is one name and one afternoon. No cadence means no nudge, ever.
- **Editing hides inside a disclosure** on both the months and the girls. The page is glanced at far more often than typed into.

**"Coming up" is not built.** The artboard's fourth card lists birthdays from `calendar.anniversaries`, which is v3 — and the artboard annotates its own limitation: six entries, nothing for extended family or friends. An almost-empty panel would advertise a gap rather than fill one, and the gap is a data-entry debt rather than a build.

## v2. Documents

The last dead label. PRD component 7 bundles three unrelated things — Paperless search, the cheat-sheet, subscription renewals — and they are built in order of usefulness rather than the order it lists them.

**There is no Documents artboard.** The canvas has eight and none is this page, so the layout follows `docs/DESIGN.md` and what Systems and Family established. Three sections stacked full width, not two columns: those two pages are columned because one part of each is genuinely narrow, and nothing here is.

**Subscriptions.** `Subscription`, and a nudge at 07:10.

- **The next renewal is derived, never stored.** `renewsOn` is *a* known renewal date, so the one off last month's statement is exactly right to type. Nothing has to run to keep it correct, it cannot drift, and it is right again the moment Steward comes back from a month off — the same reasoning that makes the level derived.
- **Every candidate is measured from the anchor, never from the previous step.** Written the obvious way, 31 October plus a month overflows into 1 December and the subscription renews on the 1st for ever. Counting from the anchor and clamping to the month's length gives what a card actually does: 31 Jan, 28 Feb, 31 Mar — the 31st is recovered rather than lost. **A test caught this before it deployed**, which is the first time the suite has paid for itself.
- **Weekly is 52/12, not four weeks a month.** Four understates by 8% and the error compounds across a list.
- **Priority 30**: real money and time-bound, above the family and people invitations at 50 and 60, below Home Assistant's named updates at 10 — it is not the house being broken.
- **The external id carries the renewal date**, so dismissing this month's notice does not silence next month's. The same trick the update rows use with their version.
- **Cancelling marks inactive rather than deleting**: what it cost and when it renewed is most of the value of having written it down.

**The cheat-sheet.** `CheatSheetEntry`, grouped by area. `secret` masks a value behind a native `<details>` — no JavaScript, and the guest wifi is off the screen when someone is behind you. **The page says plainly that this is not encryption**: the values are plain text in Postgres and in the nightly dump on the array. A cheat-sheet, never a password manager.

**Paperless ships in its "not connected" state**, naming the two variables, exactly as WhiteTower does on `/systems`. The layout is complete and the search drops into a designed hole rather than being retrofitted. It is **a named exception to rule 1** — see `docs/ARCHITECTURE.md`; a live search cannot be a collector without mirroring the archive, and the exception is bounded to a user-initiated action that returns results rather than state.

## v2. People and Family become one page, and one model

**2026-08-31, Vincent's call**, superseding the two `v2. People` and `v2. Family` sections above: *"it feels like the same subject."*

He was right, and for a reason sharper than the feel of it: **the two were only ever separate because their sources were.** PRD component 5 was vault markdown, component 8 a manual list, built a day apart against different plumbing. Steward owns both, so the split had nothing holding it up.

Then he went further — *"all people should be defined with the appropriate tag: spouse, kid, family and friends"* — which turned out to be better than merging only the page. `Kid` and `Person` were near-duplicates: two cadence fields, two last-seen fields, an idea bank on one and not the other. That existed because they were written a day apart, not because a daughter and a friend are different kinds of thing.

Decided here:

- **The tag is two fields.** Of his four, only two change behaviour: `spouse` drives the month planner, `child` a plan plus her own bank. Family and friends are identical mechanics with different grouping. So a small **`kind`** enum for behaviour and a free-text **`circle`** for grouping — "Neighbours" now costs nothing.
- **People stay on the page, not in Settings.** He suggested Settings; the reasoning against it is the one from the morning — a feed configures the News page, a tile configures the launcher, and a person *is* the content. His real concern was form clutter, and he named the better fix himself.
- **No form sits on the page.** Every add and edit opens a **dialog**, which is the pattern he pointed at in The Adventurer's Chronicle. One component per subject handling add and edit both, keyed off whether a record was passed. One correction on the way: Chronicle's add-quest and add-NPC are *routed pages*, not overlays — its dialogs are for smaller things, which is what a six-field person is. And its `dialog.tsx` wraps Base UI where Steward is on Radix, so Steward took its own from the `radix-nova` registry it was already configured for.
- **`useTransition`, not `useActionState`.** Closing a dialog on success needs an effect with `useActionState`, and `react-hooks/set-state-in-effect` already caught this project once on the theme toggle. The affected actions dropped their `(prev, formData)` signature, which is a simplification.
- **`CoupleSlot.planner` became `mine Boolean`.** It stored the literal strings "Vincent" and "Marylène", and the library hardcoded both. With a spouse in the table the names are data — his from `User.displayName`, hers from the record — and a stored name goes stale the moment either is edited.
- **A plan belongs to anyone**, not only the girls. "Lunch with Dad on Sunday" is the same idea; the children's section simply leads with it.
- **One sync, one source, one job.** `SourceKey.family` joins `capture` as a value nothing writes.

**Three bugs fixed on the way**, all live beforehand: a kid's queue row read `Couple · …`; "Reach out to your mother" wore the slate Inbox chip, there being no `people` category; and the contact nudge had no `url`, the only unclickable row in the queue. Plus `updatePerson`, exported and imported nowhere — a person's intention and cadence could not be changed after they were added.

**The first destructive migration in this project.** It drops `Kid` and deletes every `Item` with `source = 'family'`. Kid rows are copied into `Person` first **keeping their ids**, which is what makes each girl's ideas follow her. The deleted queue rows are derived, not authored, and the next sync rebuilds them. This is what the backup script built the same morning was for.

## 15. Six-week trial (**Vincent**)

**No new sources during it.** The success test, from the PRD: real things moved, nothing homeless, opened most days, stopped fiddling with the system, the tour measurably shrank, and nothing was ever silently wrong.

One thing to watch rather than measure, carried over from the relationships work: whether seeing the last-contact numbers changes how the calls feel. If it does, that panel changes.
