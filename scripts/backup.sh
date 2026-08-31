#!/bin/bash
#
# Steward's nightly database backup, for Unraid's User Scripts plugin.
#
# Most of what Steward holds is a copy of something else and re-fetches within
# five minutes of an empty database — calendars, tasks, monitors, articles.
# Four things exist nowhere else, and this script is the only thing standing
# between them and a lost array disk:
#
#   * which queue items have been dismissed
#   * the topics and feeds
#   * the launcher tiles
#   * the login
#
# Runs pg_dump inside the db container, so nothing needs postgresql-client on
# the host and the app image stays as thin as it is.
#
# Restore, with the app stopped:
#   gunzip -c /mnt/user/backups/steward/steward-2026-08-30.sql.gz \
#     | docker exec -i steward-db psql -U steward -d steward

set -euo pipefail

CONTAINER="steward-db"
DB_USER="steward"
DB_NAME="steward"
DEST="/mnt/user/backups/steward"
KEEP_DAYS=14

# A dump smaller than this is not a small database, it is a broken dump — an
# empty file, a permission error, a container that answered but had nothing.
# Writing it would quietly replace a good backup with a useless one, and the
# fourteen-day window means the good ones age out behind it.
MIN_BYTES=10240

stamp=$(date +%F)
target="$DEST/steward-$stamp.sql.gz"

mkdir -p "$DEST"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "FAILED: container $CONTAINER is not running" >&2
  exit 1
fi

# Written to a temporary name first, so an interrupted run never leaves a
# half-written file wearing today's date and looking like a backup.
tmp="$target.partial"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$tmp"

size=$(stat -c %s "$tmp")
if [ "$size" -lt "$MIN_BYTES" ]; then
  rm -f "$tmp"
  echo "FAILED: dump was only $size bytes, refusing to keep it" >&2
  exit 1
fi

mv "$tmp" "$target"
echo "Wrote $target ($size bytes)"

# Prune only after a good dump landed. A failing backup must never also be the
# thing that deletes the last working one.
deleted=$(find "$DEST" -maxdepth 1 -name 'steward-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)
echo "Kept $KEEP_DAYS days, removed $deleted older backup(s)"
