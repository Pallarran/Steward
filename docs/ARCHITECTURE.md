# Architecture

## The adapter contract

Steward pulls from seven unlike sources. That is the whole risk in the project, and this contract is what contains it.

Every source is one module exposing exactly two things:

```ts
type Adapter = {
  key: SourceKey            // 'ha' | 'rss' | 'kuma' | 'todoist' | 'unraid'
                            // | 'horizon' | 'vault' | 'gmail'
                            // the schema adds 'capture': quick capture is not
                            // an adapter, but its items still need a provenance
  intervalSeconds: number
  fetch(): Promise<NormalizedItem[]>
}
```

Rules, in order of importance:

1. **Adapters write to the database. The UI reads only the database.** No adapter is ever called from a page, a server component or a route handler that renders. A dead source cannot break the page; it can only go amber.
   **One named exception, added 2026-08-31: Paperless search.** A live document search cannot be a collector without mirroring the entire archive into Steward — a second document library, which PRD §5 explicitly says not to build. `src/lib/paperless.ts` is therefore called from a server action. The boundary is what makes it safe, and all three parts of it are load-bearing: it is **user-initiated**, never part of a render, so the page renders in full with Paperless off; it returns **search results, never state**, so there is nothing for the staleness rule to protect; and a failure is a message inside one section that cannot touch the other two. Nothing else in Steward may do this, and anything that shows current state never can.

   **A second named exception, added 2026-09-01: the local model.** `src/lib/ai.ts` calls Ollama from server actions and jobs, on the same three-part boundary — initiated by a person or a schedule, never by a render; producing generated text, never state; failing inside one section. It is **not an adapter**: no `SourceStatus`, no collector tile, no staleness, and it must never acquire them, because "the model has not answered in twenty minutes" is not a fact about the house. Anything worth keeping from a generation is written to the database and read back like everything else. **No page may await a model.**

   **Measured on WhiteTower, 2026-09-01, `gemma3:12b`: 27.5s cold, 1.4s warm.** Effectively all of it is loading an 8.1 GB file — generation itself is interactive. So a button *is* viable, and the thing that decides it is whether the model is still resident when the button is pressed. Ollama evicts after five minutes idle by default; `lib/ai.ts` sends `keep_alive: 15m`, which covers a working session without pinning 8 GB of the machine's RAM permanently to save 26 seconds on first use. Anything batched should still be a job, which pays the load once with nobody watching.

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
| `url` | where clicking through goes, nullable. The app the thing lives in — Gmail, Todoist, a cancel page. The *Steward* page is derived from `source` instead, by `SOURCE_HOME`, so a row can offer both |
| `detail` | nullable JSONB, **only for what the detail dialog needs and cannot get by joining**. Most sources need none: a renewal finds its `Subscription` by id, a monitor row finds its `Monitor` by name. Gmail and Todoist's Inbox are the exceptions — Steward stores no mail at all, and `Task` deliberately excludes Inbox tasks — so they carry the sender address and the note-and-labels here. **If it can be joined, join it**; a Json column with no stated purpose becomes a junk drawer |
| `priority` | integer, sets the order of the single prioritized list. **Ascending: 0 sits at the top.** Nothing renders the number — position carries the priority. The rungs live in `lib/priority.ts`, not at the write sites — see below |
| `occurredAt` | when the thing happened at the source |
| `expiresAt` | nullable; news gets ~48h, most things get none |
| `status` | `new` / `seen` / `dismissed` |
| `dismissedAt` | nullable |

### The priority ladder

**One file owns every rung: `lib/priority.ts`.** Until 2026-09-01 each number was a bare literal at its own producer's write site, in six files, so no two could be compared by reading either one. That is how a Home Assistant *Core* update came to sit at 10 — above every untriaged thought, every renewal and every person — while a subscription about to charge sat flat at 30, which is how Vincent found it.

| rung | what |
|---|---|
| 0 | **alarm** — broken, and losing something while it waits. Only a monitor that stopped responding and an array disk Unraid has disabled |
| 5 / 15 | a renewal today-or-tomorrow / within three days — **above the inbox, which is the point** |
| 22 | an unread email — somebody else's demand, but one with a sender waiting on it |
| 25 | a renewal further out but inside its notice window; a fortnight's warning is awareness, not work |
| 40 | a person past a cadence he set himself |
| 50 / 55 / 58 / 60 | Home Assistant updates: platform, add-on, HACS, firmware. Worth doing, never urgent, never above a person |
| 70 | **Todoist's Inbox, last.** Moved from 20 on 2026-09-02 at Vincent's instruction: these are items and ideas that do not have a priority yet, which is the whole point of an inbox. A thing nobody has judged cannot outrank the things already judged, which at 20 it did — above unread mail, above a renewal a fortnight out, above every person and every update |

**The gaps are deliberate**, so a new rung lands between two existing ones without renumbering — renumbering means every row already in the database is wrong until its producer next runs.

**`priority` must be written in the `update` clause, not only `create`.** Every producer upserts, and a rank set once at creation cannot move: that is the actual mechanism behind the renewal complaint, and it would silently defeat `renewalPriority` on its own. The file imports nothing and must not start to — `queue-row` is a client component, and the alarm constant briefly living in `lib/queue.ts` dragged `pg` into the browser bundle.

**`SourceStatus`** is one row per adapter, and it is what the staleness rule reads.

| field | notes |
|---|---|
| `source` | primary key |
| `intervalSeconds` | how often it should run |
| `lastSuccessAt` | drives "as of" |
| `lastErrorAt`, `lastError` | drives amber, and the message shown |
| `consecutiveFailures` | drives the exponential backoff in rule 6; reset to 0 by any success |

**`Monitor`** is Uptime Kuma's monitor states as of the last successful poll, and it is what `readGate` reads.

It is not in the sketch above, because the sketch assumed monitor state would arrive as queue items. It cannot: the gate is a verdict on *current* state, while an `Item` is a record of something that *arrived*. Conflating them gives either a queue with fifteen rows in it or a gate that cannot say what is up right now. The gate *card* was deleted on 2026-09-01 — Home's band carries the verdict now — but the distinction it was built on is unchanged.

| field | notes |
|---|---|
| `name` | unique. From the `monitor_name` label — see the read path note below |
| `url`, `type` | from the same labels; Kuma writes the string `"null"` rather than omitting them |
| `status` | `down` / `up` / `pending` / `maintenance`, from Kuma's 0/1/2/3 |
| `changedAt` | when `status` last changed. What "down for 41 minutes" counts from, inferred from transitions |
| `seenAt` | last successful poll that mentioned it. A monitor deleted in Kuma stops being seen and drops out of the gate |

**`CalendarEvent`** is Home Assistant's calendar events as of the last successful poll, and **`Task`** is Todoist's due-or-overdue tasks. Both are live lists for the same reason `Monitor` is: they are current state that changes underneath you, not records of something that arrived once.

`calendar.home` and `calendar.inbox` are never fetched. They are the Home Assistant Todoist integration republishing the same tasks Steward reads from Todoist directly — verified rather than assumed, all 28 of `calendar.home`'s events matching a Todoist task by exact title.

Both `Monitor` and the Home Assistant update `Item`s are **pruned by their own adapter**, not just upserted. A monitor that recovers has its queue row deleted, because a service being down is not "gone, true and final" and rule 3 will not let a dismissal be the thing that clears it. An update that gets installed stops being reported by Home Assistant, so its row is deleted too — without that, "Core 2026.8.1 is available" would sit in the queue forever after the update was applied.

**Not reachable over REST, and therefore not built**: persistent notifications and repairs. `persistent_notification.*` yields no entities, and `/api/repairs/issues`, `/api/config/repairs` and `/api/issues` all 404. Both live behind Home Assistant's WebSocket API, which rule 6 rules out. Recorded as debt in `docs/BUILD-PLAN.md` rather than solved with a second connection style.

**`Activity`** is the base game layer. One row per thing Vincent did.

| field | notes |
|---|---|
| `kind` | `cleared` / `ticked` / `filed` |
| `itemId` | nullable |
| `points` | integer |
| `createdAt` | timestamp |

Level and "remaining this week" are both derived from this table. Nothing stores a score.

**`Setting`** is a key/value table for theme and anything else per-user.

**`SystemFact`** holds small current-state facts as JSON, through `src/lib/facts.ts`. Three today: `ha:unavailable`, the count and names of entities reporting `unavailable`; `ha:updates`, pending updates split into system, add-on, HACS and firmware; and `horizon:summary`, the portfolio aggregates.

They are state rather than arriving items, so they do not belong in `Item`. Crucially, **they must not be read from `Item` either**: the queue asks "does this need you?" and dismissing answers no, while the Systems page asks "what is true?", and an update waved past in the queue is still an update that is waiting.

**They lived in `Setting` first**, and the rule for promoting them was written on 2026-08-30 and honoured on 2026-08-31 when Horizon became the second source writing one. The table earns its place with two columns `Setting` could not carry: `source`, so a fact says who wrote it; and `at`, **when the fact was true**, which is not always when it was written. That distinction is the whole reason a finance panel can say "Friday's close" rather than implying today.

`readFact` returns null when a fact has never been written, and callers must render that as *not collected* rather than as zero. A check that never ran must never look like a check that passed.

### Horizon

Read through **`GET /api/summary`**, an endpoint added to Horizon for this and deliberately narrow: the investable portfolio's value, day change, day percent and unrealised gain, and nothing else.

**Horizon calls that value `netWorthCents` and it is not net worth** — its own comment says so, because it excludes the house and every liability. The wire name is kept so the field matches what the endpoint sends, but nothing in Steward may label it "net worth", and nothing may label it "invested" either: that is the cost basis, a different number sitting right beside it. The panel says *Portfolio*. Horizon holds every holding, transaction and account name, and none of it crosses — Steward cannot leak what it never receives.

Authentication is a shared key, `HORIZON_API_KEY` here and `STEWARD_API_KEY` there, because the caller is a scheduled job with no browser. **Horizon serves nothing on that route with no key set**, so an unconfigured Horizon has not silently grown a data endpoint.

The response carries **two clocks, and they answer different questions**. `pricesAsOf` is when Horizon last wrote a price row — whether the fetch is healthy. `priceDate` is the market date the figures describe. Horizon fetches on weekdays only, so on a Sunday it can refresh happily and still be holding Friday's close, and the panel dates itself by `priceDate`. A finance panel that called Friday's numbers "today" would be the exact failure rule 2 exists to prevent, and it is the easiest one in the whole app to ship by accident.

**`User`** and **`Session`** exist because Steward has a login (PRD §4, *Remote access*). `User` is Horizon's model stripped to `id`, `email`, `passwordHash`, `displayName`, `mustChangePassword`, `lastLoginAt`, `createdAt` — no roles, no household, no locale. `Session` is Horizon's verbatim: an opaque random `token`, `expiresAt`, `userAgent`, `ipAddress`, indexed on `userId` and `token`.

There is exactly one user, and nothing else in the schema is scoped to them. Horizon's `scopedPrisma` layer is deliberately not copied: with one user it would be ceremony that hides queries without protecting anything.

## Collector intervals

| adapter | interval | notes |
|---|---|---|
| Uptime Kuma | 60s | drives the gate |
| Todoist | 5 min | overdue, due today and due tomorrow; ticking writes straight back |
| Home Assistant | 5 min | calendars, updates, notifications, repairs |
| Horizon | 15 min | the portfolio summary; Horizon fetches prices five times a day on weekdays, so polling harder learns the same number again |
| Unraid | 2 min | two small ini files on a RAM disk on the same host, so the read is nearly free |
| Server | 5 min | `/proc` costs nothing, but the BMC is a small embedded controller and nothing it reports moves faster |
| Gmail | 5 min | unread in Primary and Updates, envelopes only. An IMAP login costs more than an HTTP GET and mail is not urgent |
| RSS | 60 min | into a staging pool, not into the queue |
| Vault | 15 min | reads planner files; v2 |
| Daily ranking | 06:00 | promotes staged news into the queue |

### Gmail, and why it is IMAP

**PRD §3.2 component 2 settled this and the reasoning is worth keeping.** The Gmail API needs a Google Cloud project and an OAuth consent screen, and a self-hosted app left in "testing" mode is issued refresh tokens that **expire every seven days** — Steward would break weekly and the fix would be a human re-authorising it. An app password over IMAP has no such trap. The cost is no push, which does not matter at a five-minute poll.

**Gmail's own categories do the filtering.** `X-GM-RAW` accepts Gmail's search syntax over IMAP, so the search is `is:unread in:inbox -category:promotions -category:social -category:forums` and the classifier Vincent already trusts — and trains by using it — is the filter. Steward maintains no sender rules of its own. **Updates is deliberately kept**: it holds bills, delivery notices and most Pluri Portail mail, so dropping it would look tidier and quietly lose the things most worth queueing.

**Envelopes only. No message body is ever fetched**, so no mail contents reach Postgres. Sender, subject and date is exactly what PRD §3.2 asks a row to show.

**The external id is `X-GM-MSGID`, not the IMAP uid.** A uid is unique only within one mailbox and changes when a message moves, so the same mail would arrive twice. One trap follows from it: IMAP hands that id over in **decimal** and Gmail's web client addresses a message by its **hex**, so a permalink built from the raw value loads Gmail and shows an empty pane — no error, nothing to notice. `permalink` converts through `BigInt`, because the ids are past `Number.MAX_SAFE_INTEGER` and `Number()` silently rounds them.

**A mail row is ticked, not dismissed — rule 3.** An unread message hidden in Steward is not gone: the collector searches `is:unread`, so the row returns within five minutes and Steward has built a private notion of "cleared" that Gmail does not share. The tick sets `\Seen` over IMAP and the row leaves because the message genuinely stopped matching, exactly as a Todoist task is completed rather than hidden. The undo clears the flag again.

**Mail does not roll up.** It did until 2026-09-02 — six or more unread became one row, the rule the monitors and the HA updates use. Vincent asked for it removed and he is right: that rule is for *many rows, one event*, and five services down really is one outage, but six unread messages are six unrelated decisions and a row saying "6 unread" tells him nothing Gmail's own badge did not. One row per message now, each with its own tick. **The `MAX_FETCH` cap of fifty survives, with one tail row** — `unread:more`, keeping the X — naming how many were left behind, because mail that exists and is rendered nowhere is rule 2's failure one level down.

**Summarising a message is the third caller of the local model** (`summariseMessage`), and it opens the mailbox **read-only**, which is load-bearing: fetching a body from a read-write mailbox sets `\Seen`, so summarising would silently mark the message read and delete its own queue row on the next poll. The body is fetched, summarised and dropped — nothing is stored, so the "no mail contents in Postgres" property above still holds.

### The `Task` table is no longer "what is due"

**Changed 2026-08-31.** The Todoist adapter filtered on due-or-overdue, so every row in `Task` was something needing attention now and readers could render the table wholesale. The Today card's *Upcoming* group needs the next day, so the filter widened to `HORIZON_DAYS` and **every reader must now filter by `dueDate` explicitly rather than assume**.

**`HORIZON_DAYS` is 1**, after being 7 for one commit. On a 179-task account a week of tasks dwarfed the two things actually due today — the opposite of what a glance card is for — and crowded out the things that genuinely belong under *Upcoming*, like tomorrow's school day. Widening it again means answering the question that killed the week: what does a longer list let Vincent decide that a shorter one does not?

`horizonDay` adds calendar days in the house and re-derives the date string, rather than adding milliseconds to an instant. Across a DST boundary the latter lands an hour early and can name the day before.

### The server, and why it is not the Unraid adapter

`unraid` reports the **array** — disks, parity, capacity. `server` reports the **machine**, from two sources that know different things and cannot answer for each other:

- **`/proc`**, through a second read-only mount, for uptime, load and memory in use. Redfish reports installed memory and never used.
- **The BMC over Redfish** — AMI, RedfishVersion 1.15.1 — for health, temperatures and fans. It knows nothing about uptime.

**One collector, two facts, and a deliberate asymmetry in how they fail.** Reading a local file cannot fail the way a network call to an embedded controller can, so **a BMC that does not answer is recorded as unreachable inside `server:hardware`, with its reason, and does not throw.** The card then shows uptime and memory normally *and* says the BMC is not answering — both true at once, where an amber card would only have said the second. If `/proc` fails the adapter does throw, because then it knows nothing. One collector rather than two because a `SourceKey` value costs its own migration, and this is one machine.

**Follow links, never hardcode paths.** Redfish is self-describing: `/redfish/v1/Chassis` names its own members. `/Chassis/1` would work on this board and break on the next one, for nothing.

**`MemTotal - MemAvailable`, never `MemTotal - MemFree`.** Linux spends every spare byte on page cache, so free memory on a healthy fileserver is near zero and that subtraction reports a permanently full machine — a red gauge that means nothing. `MemAvailable` is the kernel's own estimate of what a new process could get, which is what a person means by "used".

**TLS is loosened for exactly one request.** The BMC's certificate is self-signed and `fetch` refuses it; `NODE_TLS_REJECT_UNAUTHORIZED=0` would switch off verification for Horizon, Todoist and Home Assistant too. `node:https` with a per-request `rejectUnauthorized: false` is the narrow fix.

### Launcher tiles and groups

Tiles are **one `Setting` row**, `launcher:tiles`, holding a JSON array. Order is the array index; there is no `position` field. `parse()` defaults every unknown field, so old rows read correctly when the shape grows.

**Group order is a second key, `launcher:groups`, never a field inside the tiles blob.** `parse()` returns `[]` for anything that is not an array, so changing that row's shape would silently erase every tile.

Two rules in `orderGroups`, and the second is the safety one:

1. A stored order wins, and **a stored name with no tiles still appears** — which is what lets a group be created before it is filled and removed once emptied.
2. **Any group a tile names but the list does not is appended.** A tile can never become invisible by naming a group nobody registered, which is the failure a stored list invites and why this is not a filter.

**Absent is not empty.** With no row at all the order is derived exactly as it was before — first appearance in the tile array — so introducing this reshuffled nothing. `readGroupOrder` returns `null` rather than `[]` on a parse failure for the same reason: an unreadable row means "no opinion", where `[]` would mean "no groups".

**`renameGroup` writes the tiles first.** Two rows change with no transaction across them, so the order decides what a failure between them leaves: tiles-then-order leaves tiles under a name the list does not carry, which rule 2 renders anyway. Order-first would orphan every tile under a heading that no longer exists.

**`moveTile` is group-aware.** It used to swap two elements of the flat array with no idea groups existed, so moving a tile past a group boundary silently reordered the headings back when a group's position was its first tile's position.

### The Unraid read path, settled

**Settled 2026-08-31, and none of the PRD's three candidates won.** It offered the GraphQL API, the HACS integration or an MQTT script — each of which means installing something and holding a credential. But Steward runs *on* WhiteTower, and Unraid's webGUI reads its own state from plain ini files under `/var/local/emhttp`, mode 644 on a RAM disk. A read-only bind mount gives the same numbers the Dashboard draws.

Two files. `disks.ini` has one section per slot — including the empty ones, which the adapter drops — with status, temperature, error counts and filesystem usage in 1024-byte blocks. `var.ini` is flat and carries the array state and the parity operation.

Three things worth knowing:

- **A disabled disk still reports a mounted filesystem**, because Unraid emulates it from parity. It stays in the capacity total; dropping it would show a sudden multi-terabyte loss that has not happened.
- **`mdResync` is the size of the operation in flight and drops to 0 the moment it stops, while `mdResyncPos` keeps its position.** The pair is what separates running from paused.
- **A paused check and an abandoned one are indistinguishable here.** The Parity Check Tuning plugin stands down for temperature and resumes by itself, leaving exactly what an abandoned check leaves: a non-zero `sbSyncExit` and a retained position. So Steward says "paused at 49%" and declines to characterise it further.

**What it cannot read**, and why the parity *history* is absent: `/boot/config/parity-checks.log` holds one line per completed check, but `/boot` is FAT32 and its `600 root` permissions come from the mount options rather than the file, so there is nothing to chmod. The container runs as uid 1001. Reading it would mean running as root to read one log, which is the wrong trade.

**The error count never travels without the percentage.** Zero errors on a check that has covered half the array is not a clean array, and the two numbers apart read as one. This is rule 2 at its most tempting to get wrong.

### The Uptime Kuma read path, settled

**`/metrics`, not the status-page JSON.** Probed on the live instance before choosing: `/metrics` exists and answers `WWW-Authenticate: Basic`, while `/api/status-page/heartbeat/<slug>` returns `{"heartbeatList":{},"uptimeList":{}}` for every slug because no status page has any monitors on it.

The status-page route would therefore have needed a status page built and maintained by hand, and would silently miss any monitor left off it. A collector that quietly ignores a monitor is exactly what rule 2 exists to prevent.

Two consequences, both accepted:

- **`/metrics` carries no monitor id.** The `monitor_name` label is the only stable handle, so renaming a monitor in Uptime Kuma reads as a new monitor in Steward.
- **It reports current state only, with no incident history.** "Down since" is inferred by watching for the transition, which means a service that goes down while Steward is stopped is dated from the first poll after it restarts, not from when it actually fell over.

**No conditional request for this one.** The body carries response times that change on every scrape, so an `ETag` would never match and the round trip would be wasted.

### Conditional requests are best-effort

RSS is the one source where rule 6's `ETag` and `If-Modified-Since` genuinely apply, and the collector sends both. **Whether they do anything is the publisher's decision.** Measured on the first feed added: `dndbeyond.com/posts.rss` sends no `ETag`, regenerates its `Last-Modified` on every request — 00:11:29 and 00:13:37 seconds apart, with identical content — and returns 200 to a conditional request carrying its own timestamp back.

So a feed that answers `0 unchanged` forever is not a bug. It means that publisher generates its feed dynamically, and Steward pays a full download an hour for it. The dedupe on `(feedId, externalId)` is what actually prevents duplicates; the conditional request is only ever an optimisation.

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
| `KUMA_BASE_URL`, `KUMA_KEY` | step 5 | API key from Settings → API Keys, sent as HTTP Basic with an empty username |
| `TODOIST_TOKEN` | step 6 | personal API token from Todoist → Settings → Integrations; sent as `Authorization: Bearer` |
| `HORIZON_BASE_URL`, `HORIZON_API_KEY` | v2 | the key is shared with Horizon's own `STEWARD_API_KEY`; generate once with `openssl rand -hex 32`. Unset on either side and the panel says it is not connected |
| `PAPERLESS_BASE_URL`, `PAPERLESS_TOKEN` | v3 | the document search. Token from Paperless → profile → API Auth Token, sent as `Authorization: Token`, **not** Bearer. Unset on either and the section says it is not connected |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | 2026-09-01 | Google Account → Security → 2-Step Verification → App passwords. **Paste it with the spaces stripped** — Google shows it in four groups of four and they are not part of it. Unset on either and the collector's tile reads "not set" rather than failing silently |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | 2026-09-01 | the local model. **No default URL**: unset on either and Settings says not connected, and nothing calls it. `localhost` means the container — use the host's LAN address. Ollama binds to 127.0.0.1 unless started with `OLLAMA_HOST=0.0.0.0`, and will otherwise refuse a container on its own machine |
| `ANTHROPIC_API_KEY` | superseded | was for the 06:00 news ranking. The local model covers it, at no cost and without sending Vincent's reading list off the LAN |

**No session secret.** Sessions are opaque random tokens stored in the database and matched on lookup, so there is nothing to sign. Horizon carries a `SESSION_SECRET` in its compose file and its deployment guide but no code in it reads the variable; Steward does not copy the mistake.

Served on the LAN, reached from outside through Tailscale. See PRD §4, *Remote access*, for why a Cloudflare Tunnel is not recommended and what it would need if it is added anyway.
