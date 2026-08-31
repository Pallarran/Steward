# Deployment

Two services. There is no `jobs` container: collectors run inside the app
process via `instrumentation.ts`, which is why **Steward must never run more
than one instance**.

| Service | Role | Image | Host port |
|---|---|---|---|
| `steward-db` | PostgreSQL 16 | `postgres:16-alpine` | 5434 |
| `steward` | Next.js, and the scheduler | built from `Dockerfile` | 3002 |

Horizon holds 3001 and 5433 on the same machine.

`DATABASE_URL` is assembled by `docker-compose.yml` from `DB_PASSWORD` in the
server's `.env`. Never set `DATABASE_URL` directly on the server.

## Server location

```
root@WhiteTower:/mnt/user/appdata/Steward
```

## First deploy

**One command at a time.** Wait for each to finish and confirm it succeeded
before running the next. Do NOT chain them with `&&` — a migration that fails
quietly followed by a rebuild deploys code referencing columns that do not
exist.

```bash
git clone https://github.com/Pallarran/Steward.git /mnt/user/appdata/Steward
```
```bash
cd /mnt/user/appdata/Steward
```
```bash
cp .env.example .env
```

Fill in `.env`: `DB_PASSWORD`, `SEED_EMAIL`, and a temporary `SEED_PASSWORD`.
`STEWARD_ICON_URL` already points at the raw GitHub copy and needs no change.

Generate the password with **`openssl rand -hex 24`**, not base64. Compose
interpolates it into `postgresql://steward:${DB_PASSWORD}@db:5432/steward`,
and base64's `/` truncates the URL authority — the connection then fails with
an error that does not mention the password. Hex has the same entropy and no
URL-significant characters.

```bash
docker compose up -d --build
```
```bash
docker compose run --rm app npx prisma migrate deploy
```

**Read that output, do not just check it exited.** When `migrate deploy` finds
nothing to apply it prints `No migration found in prisma/migrations` and
**exits 0**, so a deploy that applied no schema at all looks identical to a
successful one. That happened on the first deploy here, and only surfaced when
the seed hit a table that did not exist. Confirm the tables before going on:

```bash
docker compose exec db psql -U steward -c "\dt"
```

Expect `User`, `Session`, `Setting` and `_prisma_migrations`.

```bash
docker compose run --rm app npx tsx prisma/seed.ts
```

Then sign in at `http://<whitetower-lan-ip>:3002`. The seeded password is
temporary and the app forces a change on first sign-in.

## Standard deploy (no migration)

```bash
cd /mnt/user/appdata/Steward
```
```bash
git pull
```
```bash
docker compose up -d --build
```

## Deploy with a migration

**Build before migrating.** Horizon's runbook migrates first, which is wrong
here and was wrong there: `docker compose run` uses the image that already
exists, and after a `git pull` that image does not contain the new migration
yet. `migrate deploy` then finds nothing, applies nothing, and exits 0.

```bash
cd /mnt/user/appdata/Steward
```
```bash
git pull
```
```bash
docker compose build
```
```bash
docker compose run --rm app npx prisma migrate deploy
```
```bash
docker compose up -d
```

Building first means the image is ready but not yet serving, so the migration
runs against the old code still handling requests. That is safe for additive
migrations, which is all of them so far. For one that drops or renames a
column, stop the app first with `docker compose stop app` and start it again
after the migration.

## Useful commands

```bash
# Logs. The heartbeat should appear once a minute, never twice.
docker compose logs -f app

# psql shell
docker compose exec db psql -U steward

# Forgotten password. Clears every session.
docker compose run --rm app npx tsx scripts/reset-password.ts <email> <new-password>

# Full rebuild
docker compose build --no-cache
docker compose up -d
```

Locally, before deploying: `pnpm test` runs the parser and date tests in under
a second. They cover Uptime Kuma's metrics format, RSS and Atom parsing, and
the timezone logic behind "due today" — the pieces where a regression would be
silently wrong rather than visibly broken.

## Backups

Most of what Steward holds is a copy of something else and re-fetches within
five minutes of an empty database — calendars, tasks, monitors, articles.
**Four things exist nowhere else**: which queue items have been dismissed, the
topics and feeds, the launcher tiles, and the login. `scripts/backup.sh` is the
only thing between those and a lost array disk.

It runs `pg_dump` **inside the db container**, so nothing needs
`postgresql-client` on the host and the app image stays as thin as it is.

Set it up once, in Unraid's **User Scripts** plugin:

1. **Add New Script**, name it `steward-backup`.
2. **Edit Script**, paste the contents of `scripts/backup.sh`, save.
3. Set the schedule to **Scheduled Daily** (it runs at 00:00).
4. **Run Script** once by hand and read the output. It should end with
   `Wrote /mnt/user/backups/steward/steward-<date>.sql.gz (<n> bytes)`.

The destination share and the fourteen-day window are the two constants at the
top of the script.

Two things it deliberately does:

- **Refuses a dump under 10 KB.** An empty file, a permission error or a
  container that answered with nothing would otherwise replace a good backup
  with a useless one — and with a fourteen-day window, the good ones then age
  out behind it.
- **Prunes only after a good dump lands.** A failing backup must never also be
  the thing that deletes the last working one.

To restore, with the app stopped:

```bash
docker compose stop app
```
```bash
gunzip -c /mnt/user/backups/steward/steward-<date>.sql.gz | docker exec -i steward-db psql -U steward -d steward
```
```bash
docker compose start app
```

## Uptime Kuma

Steward reads `/metrics`, which needs an API key: Uptime Kuma → profile menu →
**Settings** → **API Keys** → **Add API Key**. Put it in the server `.env` as
`KUMA_KEY`, with `KUMA_BASE_URL` alongside it. Both are passed to the app
container by compose.

Check it end to end from the server:

```bash
docker compose logs --since 5m app | grep '"source":"kuma"'
```

A healthy line reads `"summary":"15 monitors, 0 down"`. A failing one names the
reason, and the gate turns amber within three minutes — three times the 60s
interval.

## Remote access

Steward is served on the LAN and reached from outside through **Tailscale**.
See the PRD §4, *Remote access*: a Cloudflare Tunnel is not recommended, and
if one is added it needs Cloudflare Access in front of it rather than relying
on Steward's own login.

`ALLOW_HTTP=true` keeps session cookies working over plain HTTP on the LAN.
Once every route in is HTTPS, remove it so cookies become `Secure`.
