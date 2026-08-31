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
2. Systems panel **and a Systems page**: Uptime Kuma and Home Assistant. **Unraid is deferred to v2** because it has no read path yet. The page was added 2026-08-30 — PRD §3.4 item 2 carries the reasoning. A check Steward never made is shown as not connected, never as "none".
3. Today panel: HA calendars, tasks due, tonight's meal, waste collection, tomorrow's school day.
4. Queue: items, dismissal, expiry, the morning ranking. **One prioritized list, no tiers.** Position carries the priority.
5. Quick capture into Steward's own inbox, with three triage actions: make a Todoist task, file to the vault, drop.
6. Task tick writing back to Todoist directly.
7. News: RSS collector plus daily curation.
8. Base game layer: XP from cleared items and ticked tasks, a **level** (not a tier ladder), and a "remaining this week" panel. Refined in later versions.

Explicitly out of v1: Gmail, finance, relationships, the couple and per-girl planner panels, Paperless, subscriptions, health, the learning shelf, the D&D session date, Unraid.

**v2 and v3 started early, 2026-08-31**, at Vincent's decision to have every page in place before the two new mechanics. Built since: finance (reading a new endpoint in Horizon), people, the couple and per-girl planners, subscriptions and the cheat-sheet. All eight nav items are now live. Still out: Gmail, Unraid, Paperless's actual wiring (the section exists, unconnected), health, the learning shelf and the D&D session date. **Deferred at his request**: the 06:00 news ranking and the base game layer, both being new rather than replacements for something he already tours.

## Working with Vincent

Cowork-OS has a root `CLAUDE.md` that governs sessions there. This repo cannot see it, so the rules that matter most at the keyboard are restated here. They are not duplicated anywhere in this repo.

- **One thing at a time.** One command, one question, one decision. Never a batch, in chat or in a document. No "open questions" list at the end of anything. Ask the first, wait, then the next.
- **Disagree plainly** when he is wrong, with your reasoning and what you would do instead. Do not bury it in a caveat.
- **When he challenges a call, verify before yielding.** Check the source. Folding without checking is worse than being wrong the first time.
- **Finished is where review starts.** Run a review pass on completed work before it is locked, even after it passed its own checks. Errors cluster in the parts you were most confident about.
- **Reversibility.** Before anything destructive or hard to undo, show the plan, name what cannot be undone, and wait for an explicit "proceed". This covers migrations that drop data, bulk edits, and anything touching Home Assistant, Unraid, containers or the network.
- Lead with the conclusion. Show the reasoning, especially where it was a close call and what you rejected.

## Conventions and guardrails

- **No work artifacts anywhere in this project.** Regulatory constraint. Work context can inform reasoning, never storage.
- **Secrets live in `.env`, never committed.** A Todoist API token, one Home Assistant long-lived token, one Uptime Kuma key, the Horizon endpoint, the database URL, the database password.
- **Served on the LAN, reached from outside through Tailscale.** Superseded "LAN only" on 2026-08-29; PRD §4 *Remote access* carries the reasoning. A Cloudflare Tunnel is not recommended, and if one is added it needs Cloudflare Access in front of it rather than relying on Steward's own login.
- **Steward has a login, from step 1.** Single user, argon2id, an opaque session token in an httpOnly cookie, Horizon's stack minus its roles and multi-user scoping. Every page lives under a route group whose layout calls `requireAuth()`, so a new page is behind the login by construction rather than by remembering.
- **Do not add a component that is not in the PRD** without updating the PRD first.
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
