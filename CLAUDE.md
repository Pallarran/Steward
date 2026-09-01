# Steward

Vincent's personal life dashboard. One working surface that replaces a daily tour of ten-plus apps: Discord, Cowork, Obsidian, Todoist, Gmail, Unraid, Home Assistant, Pluri Portail, Qustodio, Uptime Kuma and a Stream Deck. Self-hosted on WhiteTower, single user, served on the LAN and reached from outside through Tailscale.

**This file owns how to build it. The PRD owns why**, and lives outside this repo at `C:\Cowork-OS\HomeLab-HQ\Projects\Steward\Steward-PRD.md`. It is signed off. Read it before proposing anything that changes scope, and update it rather than drifting from it.

## Stack, settled

Next.js, TypeScript, Tailwind, shadcn/ui, Prisma, Postgres 16. Plus `next-themes` (light and dark switch) and `node-cron` (schedule).

**Two names in the settled stack are not installed**, corrected 2026-08-30. `recharts` arrives with the Finance panel in v2 and has no v1 use. `@tanstack/react-query` is not merely unused, it is absent: the panels are server components reading Postgres directly, so keeping them fresh is `router.refresh()` on an interval rather than client fetches against an API surface that does not need to exist. Add it if something genuinely interactive needs it; do not add it to satisfy this list. See `docs/BUILD-PLAN.md`. Same shape as Horizon at `C:\Users\vince\Code\Horizon`, which is the reference implementation for compose files, Prisma setup and job wiring. Read it rather than inventing.

**Two containers on WhiteTower: `app` and `db`.** Collectors run inside the app process via Next's `instrumentation.ts` hook, not a separate jobs service.

**Steward must never run more than one instance.** The scheduler lives in the app process, so a second instance means every collector runs twice. There is no leader election and there does not need to be.

## The three rules that govern everything

1. **Adapters never touch the UI.** Every source is a module exposing a fetch that returns normalized items plus a last-success timestamp. Adapters write to the database; the page reads only the database. One adapter failing must never stop the other six.
2. **Nothing is ever shown as current when it is stale.** Every panel carries an "as of" time. A collector that has not succeeded within three times its interval turns its panel amber and names how long it has been stale. An empty panel is never rendered as a healthy one. This single rule is what separates Steward from the Homepage instance it replaces.
3. **Dismissible is only for items where "gone" is true and final.** A read article is gone. A still-due task is not: hiding it creates a private notion of "cleared" that Todoist does not share, and the two drift. Tasks get ticked, not dismissed.

## v1 scope

Build only these. Anything else needs the PRD updated first.

1. Launcher grid, full set of tiles.
2. Systems panel **and a Systems page**: Uptime Kuma, Home Assistant, **Unraid** and **the server itself** — `/proc` for uptime, load and memory, the BMC over Redfish for health, temperatures and fans. The page was added 2026-08-30 — PRD §3.4 item 2 carries the reasoning. A check Steward never made is shown as not connected, never as "none".

   **Unraid joined on 2026-08-31 and needed no read path in the end.** The PRD's three candidates — the GraphQL API, the HACS integration, an MQTT script — all meant installing something and holding a credential. Steward runs *on* WhiteTower, and Unraid's webGUI reads its own state from ini files under `/var/local/emhttp`, mode 644. A read-only bind mount was the whole answer. `docs/ARCHITECTURE.md` carries what those files mean and what deliberately cannot be read.
3. Today panel: HA calendars, tasks due, tonight's meal, waste collection, tomorrow's school day.
4. Queue: items, dismissal, expiry, the morning ranking. **One prioritized list, no tiers.** Position carries the priority.
5. Quick capture into Steward's own inbox, with three triage actions: make a Todoist task, file to the vault, drop.
6. Task tick writing back to Todoist directly.
7. News: RSS collector plus daily curation.
8. Base game layer: XP from cleared items and ticked tasks, a **level** (not a tier ladder), and a "remaining this week" panel. Refined in later versions.

Explicitly out of v1: Gmail, finance, relationships, the couple and per-girl planner panels, Paperless, subscriptions, health, the learning shelf, the D&D session date, Unraid. **Finance, relationships, the planners, subscriptions and Unraid have all since been built** — see below.

**v2 and v3 started early, 2026-08-31**, at Vincent's decision to have every page in place before the two new mechanics. Built since: finance (reading a new endpoint in Horizon), people, the couple and per-girl planners, subscriptions and the cheat-sheet. **Subscriptions live on Finance, not Documents** — moved 2026-09-01, because the PRD filed them under Documentation for their imagined source rather than their subject. **The rail is seven items, not eight** — Family and People merged the same day into one People page and one `Person` model, PRD components 5 and 8 having been split only because their sources were. All seven are live.

**A page manages its own things.** The controls that create, edit and arrange something live on the page that shows it, not on Settings — subscriptions on Finance, launcher tiles and groups on the Launcher, both 2026-09-01. On the Launcher, editing is a **mode** — an *Arrange* button and `?edit=1` — while adding stays at the top and always reachable. Two surfaces editing one record drift. Settings keeps News sources, which probably belong on `/news` by the same argument.

**Forms open in dialogs, not on the page.** Established on People, from the pattern in The Adventurer's Chronicle. One component per subject handles add and edit both. The other pages still carry inline forms and should follow when each is next touched. Still out: Gmail, Paperless's actual wiring (the section exists, unconnected), health, the learning shelf and the D&D session date. **Deferred at his request**: the 06:00 news ranking and the base game layer, both being new rather than replacements for something he already tours.

## Working with Vincent

Cowork-OS has a root `CLAUDE.md` that governs sessions there. This repo cannot see it, so the rules that matter most at the keyboard are restated here. They are not duplicated anywhere in this repo.

- **One thing at a time.** One command, one question, one decision. Never a batch, in chat or in a document. No "open questions" list at the end of anything. Ask the first, wait, then the next.
- **Disagree plainly** when he is wrong, with your reasoning and what you would do instead. Do not bury it in a caveat.
- **When he challenges a call, verify before yielding.** Check the source. Folding without checking is worse than being wrong the first time.
- **Finished is where review starts.** Run a review pass on completed work before it is locked, even after it passed its own checks. Errors cluster in the parts you were most confident about.
- **Reversibility.** Before anything destructive or hard to undo, show the plan, name what cannot be undone, and wait for an explicit "proceed". This covers migrations that drop data, bulk edits, and anything touching Home Assistant, Unraid, containers or the network.
- Lead with the conclusion. Show the reasoning, especially where it was a close call and what you rejected.

## What the checks do not catch

`pnpm build`, `pnpm lint`, `pnpm exec tsc` and `pnpm test` all passing means **the code compiles**, not that a page renders. Every page under `(app)` is dynamic, so the build never renders one — and there is no Docker on the development machine, so nothing can be rendered locally either. **The first render of anything is always on WhiteTower.**

Two bugs have shipped through that gap already. Both were caught by Vincent looking at the screen, and both were the same shape: correct TypeScript that is wrong at request time.

- **Never pass an inline function to a client component from a server component.** `action={() => deletePerson(id)}` type-checks, builds, and then fails on every request with *"Functions cannot be passed directly to Client Components"*. Pass the **server-action reference** and its argument separately: `action={deletePerson} id={person.id}`. A client component's props may be data, React nodes, or server-action references — never a closure.
- **A control styled into invisibility is a control that does not exist.** "Refresh icons" shipped as a ghost button in `text-faint` beside an equally faint count, and Vincent worked around it rather than finding it.

So: after a deploy, **open every page that changed.** Not the one that was worked on — every one.

## Conventions and guardrails

- **No work artifacts anywhere in this project.** Regulatory constraint. Work context can inform reasoning, never storage.
- **Secrets live in `.env`, never committed.** A Todoist API token, one Home Assistant long-lived token, one Uptime Kuma key, the Horizon endpoint, the database URL, the database password.
- **Served on the LAN, reached from outside through Tailscale.** Superseded "LAN only" on 2026-08-29; PRD §4 *Remote access* carries the reasoning. A Cloudflare Tunnel is not recommended, and if one is added it needs Cloudflare Access in front of it rather than relying on Steward's own login.
- **Steward has a login, from step 1.** Single user, argon2id, an opaque session token in an httpOnly cookie, Horizon's stack minus its roles and multi-user scoping. Every page lives under a route group whose layout calls `requireAuth()`, so a new page is behind the login by construction rather than by remembering.
- **Do not add a component that is not in the PRD** without updating the PRD first.
- **The UI never names a spec, a protocol or a file.** *"PRD §7, decision 2"*, *"not connected — WebSocket only"* and *"the GraphQL API and an MQTT script are the candidates"* all shipped as rendered copy on `/systems` — a todo list in a card on the page you open to check the house is fine. On screen: what is true, and what to do about it. The reasoning goes in `docs/`, and a code comment beside it points there. The one deliberate exception is an env var name Vincent must set himself, which is an instruction rather than a note, and it is set in `font-mono`.
- **Do not design around Discord DMs or mentions.** They are not legitimately reachable: a user token is self-botting and an account-ban risk, and a bot never sees DMs. Discord is a launcher tile.
- **Tasks come from the Todoist API directly, not through Home Assistant.** Changed 2026-08-30; PRD §3.2 carries the reasoning. It removes the write-back risk this guardrail used to warn about, and gives the due dates, priorities and recurrence that filtering 179 tasks actually needs. Home Assistant keeps calendars, `update.*`, notifications, repairs, the meal plan, waste collection and school days.

## Reference

- `docs/ARCHITECTURE.md`: the adapter contract, the data model, collector intervals, the cloud boundary.
- `docs/DESIGN.md`: palette for both themes, type, radius, layout and component anatomy.
- `docs/BUILD-PLAN.md`: the ordered steps with acceptance criteria.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
