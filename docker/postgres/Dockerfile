FROM postgres:16-alpine

RUN apk add --no-cache openssl

COPY docker/postgres/entrypoint.sh /usr/local/bin/qrie-postgres-entrypoint.sh
RUN chmod +x /usr/local/bin/qrie-postgres-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/qrie-postgres-entrypoint.sh"]
