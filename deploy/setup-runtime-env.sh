#!/bin/sh
# Monta deploy/.env.vps e deploy/.env.runtime no VPS, sem passar segredos pelo chat.
# Reaproveita o .env da instalação antiga (PM2) e as senhas de private/.
# Uso: sh setup-runtime-env.sh [/caminho/do/.env/antigo]
set -eu
cd "$(dirname "$0")"
OLD="${1:-/var/www/pedidoprontobot/server/.env}"
[ -d private ] || { echo "Rode antes: sh prepare-vps-private.sh" >&2; exit 1; }
[ -f "$OLD" ] || { echo "Não achei o .env antigo em $OLD" >&2; exit 1; }
[ -e .env.runtime ] && { echo ".env.runtime já existe; não sobrescrevo" >&2; exit 1; }
umask 077

ask() { # pergunta sem mostrar na tela
  printf '%s: ' "$1" >/dev/tty
  stty -echo </dev/tty 2>/dev/null || true
  read -r value </dev/tty
  stty echo </dev/tty 2>/dev/null || true
  printf '\n' >/dev/tty
  printf '%s' "$value"
}

# Chaves que a instalação nova define por conta própria.
SKIP='^(DATABASE_URL|REDIS_URL|PORT|NODE_ENV|APP_URL|RUN_BACKGROUND_JOBS|PLAY_SERVICE_ACCOUNT_FILE|MEDIA_STORAGE|AWS_REGION|S3_ENDPOINT|MEDIA_BUCKET|MEDIA_PUBLIC_URL|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|MAPBOX_GEOCODING_TOKEN|MAPBOX_PERMANENT_GEOCODING)='

R2_ENDPOINT=$(ask 'Endpoint do R2 (https://<id>.r2.cloudflarestorage.com)')
R2_BUCKET=$(ask 'Nome do bucket R2')
R2_PUBLIC=$(ask 'URL pública das fotos (https://...)')
R2_KEY=$(ask 'Access Key ID do R2')
R2_SECRET=$(ask 'Secret Access Key do R2')
MAPBOX_SECRET=$(ask 'Token secreto do Mapbox (geocodificação)')

{
  echo "APP_URL=https://agentegestor.com.br"
  echo "DATABASE_URL=postgresql://agt_app:$(cat private/postgres-app-password)@postgres:5432/agtgestor?connection_limit=8&pool_timeout=10"
  echo "REDIS_URL=rediss://:$(cat private/redis-password)@redis:6379"
  grep -E '^[A-Z][A-Z0-9_]*=' "$OLD" | grep -Ev "$SKIP" || true
  echo "MEDIA_STORAGE=s3"
  echo "AWS_REGION=auto"
  echo "S3_ENDPOINT=$R2_ENDPOINT"
  echo "MEDIA_BUCKET=$R2_BUCKET"
  echo "MEDIA_PUBLIC_URL=$R2_PUBLIC"
  echo "AWS_ACCESS_KEY_ID=$R2_KEY"
  echo "AWS_SECRET_ACCESS_KEY=$R2_SECRET"
  echo "MAPBOX_GEOCODING_TOKEN=$MAPBOX_SECRET"
  echo "MAPBOX_PERMANENT_GEOCODING=true"
} > .env.runtime

if [ ! -e .env.vps ]; then
  {
    echo "APP_IMAGE=agtgestor:local"
    echo "APP_DOMAIN=agentegestor.com.br"
    echo "ACME_EMAIL=contato@agentegestor.com.br"
  } > .env.vps
fi

PLAY_OLD=$(grep -E '^PLAY_SERVICE_ACCOUNT_FILE=' "$OLD" | tail -1 | cut -d= -f2- || true)
if [ -n "$PLAY_OLD" ] && [ -f "$PLAY_OLD" ] && [ ! -e private/play-service-account.json ]; then
  cp "$PLAY_OLD" private/play-service-account.json
  chmod 644 private/play-service-account.json
fi

chmod 600 .env.runtime .env.vps
echo "Pronto: .env.runtime e .env.vps criados (valores não exibidos)."
