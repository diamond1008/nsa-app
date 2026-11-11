#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$APP_DIR"

if [[ ! -f .env.production ]]; then
  echo "[backup] ERROR: .env.production not found in $APP_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/nsa-${TIMESTAMP}.dump"

echo "[backup] Creating PostgreSQL custom dump: $BACKUP_FILE"
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl -Z 9' \
  > "$BACKUP_FILE"

chmod 600 "$BACKUP_FILE"

# Verify archive integrity inside the postgres container
docker compose --env-file .env.production -f compose.production.yaml exec -T postgres \
  pg_restore --list < "$BACKUP_FILE" >/dev/null

echo "[backup] Verified backup integrity ($(du -h "$BACKUP_FILE" | cut -f1))."

# Prune backups older than RETENTION_DAYS
find "$BACKUP_DIR" -maxdepth 1 -type f -name "nsa-*.dump" -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] Pruned dumps older than ${RETENTION_DAYS} days."
