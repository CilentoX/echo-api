#!/bin/sh
# Entrpoint simples: aguarda PostgreSQL e inicia a API.
# Não falha se a criação de role não funcionar — a API inicia de qualquer forma.

echo "=== Entrypoint: aguardando PostgreSQL ficar disponível ==="
until pg_isready -h db -p 5432 -U postgres >/dev/null 2>&1; do
  echo "PostgreSQL não está pronto, aguardando 2s..."
  sleep 2
done
echo "PostgreSQL está disponível."

# Tenta criar o role echo_api se não existir (não crítico se falhar)
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's/.*:\/\/\([^:@]*\):.*/\1/p')
DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

if [ -n "$DB_USER" ]; then
  echo "=== Entrypoint: garantindo que o role '$DB_USER' exista ==="
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h db -U postgres -d "${POSTGRES_DB:-echo_profiles}" \
    -v ON_ERROR_STOP=0 \
    -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}'; END IF; END \$\$;" >/dev/null 2>&1 || echo "AVISO: não foi possível criar role '$DB_USER'"
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h db -U postgres -d "${POSTGRES_DB:-echo_profiles}" \
    -v ON_ERROR_STOP=0 \
    -c "GRANT ALL PRIVILEGES ON DATABASE \"${POSTGRES_DB:-echo_profiles}\" TO ${DB_USER};" >/dev/null 2>&1 || echo "AVISO: não foi possível conceder privilégios no banco"
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h db -U postgres -d "${POSTGRES_DB:-echo_profiles}" \
    -v ON_ERROR_STOP=0 \
    -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" >/dev/null 2>&1 || echo "AVISO: não foi possível conceder privilégios no schema"
fi

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/server.js