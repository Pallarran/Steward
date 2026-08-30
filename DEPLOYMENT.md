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
cd /mnt/user/appdata/Steward
```
```bash
git clone <remote> .
```
```bash
cp .env.example .env
```

Fill in `.env`: `DB_PASSWORD` from `openssl rand -base64 24`, `SEED_EMAIL`,
a temporary `SEED_PASSWORD`, and `STEWARD_ICON_URL` pointing at WhiteTower's
LAN address on port 3002.

```bash
docker compose up -d --build
```
```bash
docker compose run --rm app npx prisma migrate deploy
```
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
