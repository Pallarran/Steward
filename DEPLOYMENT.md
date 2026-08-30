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

```bash
cd /mnt/user/appdata/Steward
```
```bash
git pull
```
```bash
docker compose run --rm app npx prisma migrate deploy
```
```bash
docker compose up -d --build
```

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

## Remote access

Steward is served on the LAN and reached from outside through **Tailscale**.
See the PRD §4, *Remote access*: a Cloudflare Tunnel is not recommended, and
if one is added it needs Cloudflare Access in front of it rather than relying
on Steward's own login.

`ALLOW_HTTP=true` keeps session cookies working over plain HTTP on the LAN.
Once every route in is HTTPS, remove it so cookies become `Secure`.
