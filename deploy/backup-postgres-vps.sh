#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_DIR="/opt/agtgestor"
readonly COMPOSE_FILE="$APP_DIR/deploy/compose.vps.yaml"
readonly ENV_FILE="$APP_DIR/deploy/.env.vps"
readonly BACKUP_DIR="/var/backups/agtgestor-postgres"
readonly LOG_FILE="/var/log/agtgestor-postgres-backup.log"
readonly KEEP_DAYS="14"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  printf '%s backup ignorado: outra execução está ativa\n' "$(date --iso-8601=seconds)" >> "$LOG_FILE"
  exit 0
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
temporary="$BACKUP_DIR/.agtgestor-$timestamp.dump.part"
destination="$BACKUP_DIR/agtgestor-$timestamp.dump"

cleanup() {
  rm -f -- "$temporary"
}
trap cleanup EXIT

cd "$APP_DIR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U agt_admin -d agtgestor --format=custom > "$temporary"

test -s "$temporary"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --list < "$temporary" > /dev/null

chmod 600 "$temporary"
mv -- "$temporary" "$destination"
trap - EXIT

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'agtgestor-*.dump' -mtime "+$KEEP_DAYS" -delete
printf '%s backup concluído: %s (%s bytes)\n' \
  "$(date --iso-8601=seconds)" "$destination" "$(stat -c %s "$destination")" >> "$LOG_FILE"
