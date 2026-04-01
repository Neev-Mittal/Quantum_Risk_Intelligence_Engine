#!/bin/sh
set -eu

SSL_DIR="/etc/postgresql/ssl"
mkdir -p "${SSL_DIR}"

if [ ! -f "${SSL_DIR}/server.key" ] || [ ! -f "${SSL_DIR}/server.crt" ]; then
  openssl req \
    -x509 \
    -newkey rsa:4096 \
    -sha256 \
    -days 3650 \
    -nodes \
    -keyout "${SSL_DIR}/server.key" \
    -out "${SSL_DIR}/server.crt" \
    -subj "/CN=qrie-postgres"
fi

chmod 600 "${SSL_DIR}/server.key"
chmod 644 "${SSL_DIR}/server.crt"

if [ "$(id -u)" = "0" ]; then
  chown postgres:postgres "${SSL_DIR}/server.key" "${SSL_DIR}/server.crt"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
