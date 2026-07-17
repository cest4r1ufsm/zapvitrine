#!/usr/bin/env bash
# Backup diário do AGTgestor — banco SQLite (toda execução) + uploads (domingos)
# Instalação: ver deploy/RESTORE.md
set -uo pipefail

DB="/var/www/pedidoprontobot/server/prisma/dev.db"
UPLOADS_DIR="/var/www/pedidoprontobot/server/uploads"
BACKUP_DIR="/var/backups/agtgestor"
LOG="/var/log/agtgestor-backup.log"
RETENTION_DAYS=14
STAMP="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# ── Banco (sqlite3 .backup = snapshot consistente mesmo com o app rodando; NUNCA usar cp) ──
DB_OUT="$BACKUP_DIR/db-$STAMP.db"
if ! sqlite3 "$DB" ".backup '$DB_OUT'"; then
  log "ERRO: sqlite3 .backup falhou"
  exit 1
fi

# Integridade: só limpamos backups antigos se o novo estiver íntegro
INTEGRITY="$(sqlite3 "$DB_OUT" 'PRAGMA integrity_check;' 2>>"$LOG")"
if [ "$INTEGRITY" != "ok" ]; then
  log "ERRO: integrity_check retornou '$INTEGRITY' — retenção NÃO executada nesta rodada"
  exit 1
fi

gzip -f "$DB_OUT"
log "OK: banco -> $DB_OUT.gz (integrity: ok)"

# ── Uploads (semanal, aos domingos) ──
if [ "$(date +%u)" = "7" ]; then
  UP_OUT="$BACKUP_DIR/uploads-$STAMP.tar.gz"
  if tar czf "$UP_OUT" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>>"$LOG"; then
    log "OK: uploads -> $UP_OUT"
  else
    log "ERRO: tar dos uploads falhou"
  fi
fi

# ── Retenção ──
find "$BACKUP_DIR" -name 'db-*.db.gz' -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +$RETENTION_DAYS -delete
log "Retenção aplicada (${RETENTION_DAYS}d). Fim."
