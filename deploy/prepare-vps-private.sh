#!/bin/sh
# Explicit operator preparation on Linux, not run by the app or compose startup.
set -eu
cd "$(dirname "$0")"
if [ -e private ]; then echo "private already exists; preserve existing keys/passwords" >&2; exit 1; fi
umask 077
mkdir private
for name in postgres-admin-password postgres-app-password redis-password; do openssl rand -hex 32 > "private/$name"; done
openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj '/CN=AGT private Redis CA' -keyout private/redis-ca.key -out private/redis-ca.crt
openssl req -newkey rsa:3072 -nodes -subj '/CN=redis' -keyout private/redis-server.key -out private/redis-server.csr
printf 'subjectAltName=DNS:redis\nextendedKeyUsage=serverAuth\n' > private/redis-extensions.cnf
openssl x509 -req -in private/redis-server.csr -CA private/redis-ca.crt -CAkey private/redis-ca.key -CAcreateserial -days 825 -extfile private/redis-extensions.cnf -out private/redis-server.crt
# Individual file bind mounts allow container services to read these, while the
# parent host directory stays0700. CA signing key is never mounted in containers.
chmod 644 private/redis-ca.crt private/redis-server.crt private/redis-server.key
printf '%s\n' 'Private files prepared. Copy password values manually into protected .env.vps; never commit or print them in shared logs.'
