#!/usr/bin/env bash
set -euo pipefail

# Retired after the national PostgreSQL/PostGIS migration. This former SQLite
# recipe must never stop a production process or mutate its database now.
printf '%s\n' 'Este script SQLite foi desativado. Use o plano PostgreSQL/PostGIS em infra/terraform/README.md e rode node server/scripts/check-integrations.js no ambiente alvo.' >&2
exit 1

# Run AFTER updating this checkout and reviewing its changes. No implicit git reset,
# secret changes, database deletion or --accept-data-loss is performed.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
test -f server/.env
test -f server/prisma/schema.prisma
command -v pm2 >/dev/null

cd server
npm ci
./node_modules/.bin/prisma generate
cd ../client
npm ci
npm run build
cd ../server

DB_FILE="$(node -e 'require("dotenv").config({quiet:true});const path=require("path");const u=process.env.DATABASE_URL;if(!u||!u.startsWith("file:"))throw Error("SQLite DATABASE_URL required");console.log(path.resolve("prisma",u.slice(5)));')"
test -f "$DB_FILE"
BACKUP_DIR="/var/backups/agtgestor/official-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
pm2 stop pedido-pronto-bot
cp -p -- "$DB_FILE" "$BACKUP_DIR/database.db"
for suffix in -wal -shm; do
  if test -f "$DB_FILE$suffix"; then cp -p -- "$DB_FILE$suffix" "$BACKUP_DIR/database.db$suffix"; fi
done
cp -p -- .env "$BACKUP_DIR/server.env"
chmod 600 "$BACKUP_DIR"/*
printf 'Backup criado em %s\n' "$BACKUP_DIR"

# Additive schema only. Prisma must stop on any unreviewed destructive change.
if ! ./node_modules/.bin/prisma db push --skip-generate; then
  printf 'Migração interrompida. Backup preservado em %s. Confira o erro antes de reiniciar.\n' "$BACKUP_DIR" >&2
  exit 1
fi
pm2 restart pedido-pronto-bot --update-env
pm2 status
curl --fail --silent --show-error https://agentegestor.com.br/api/health
printf '\nPublicação concluída. A ativação na Meta e o teste no Android continuam obrigatórios.\n'
