#!/bin/sh
# Entrypoint para garantir que o usuário do banco exista antes de iniciar a API.
# O volume do PostgreSQL pode já conter dados de deploys anteriores, então
# a inicialização automática do postgres (POSTGRES_USER/POSTGRES_DB) é pulada.
# Este script cria o usuário especificado em DATABASE_URL se ele não existir.

set -e

echo "=== Entrypoint: aguardando PostgreSQL ficar disponível ==="
until pg_isready -h db -p 5432 -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; do
  echo "PostgreSQL não está pronto, aguardando 2s..."
  sleep 2
done
echo "PostgreSQL está disponível."

# Extrai usuário e senha do DATABASE_URL (formato: postgresql://user:pass@host:port/db)
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's/.*:\/\/\([^:@]*\):.*/\1/p')
DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

if [ -z "$DB_USER" ]; then
  echo "AVISO: não foi possível extrair usuário do DATABASE_URL, pulando criação de role."
else
  echo "=== Entrypoint: garantindo que o role '$DB_USER' exista ==="

  # Função para executar psql com retry
  run_psql() {
    local attempt=1
    local max_attempts=10
    until PGPASSWORD="${POSTGRES_PASSWORD}" psql \
      -h db \
      -U "${POSTGRES_USER:-postgres}" \
      -d "${POSTGRES_DB:-echo_profiles}" \
      -v ON_ERROR_STOP=0 \
      -c "$1" >/dev/null 2>&1; do
      if [ "$attempt" -ge "$max_attempts" ]; then
        echo "ERRO: falha ao executar psql após $max_attempts tentativas."
        return 1
      fi
      echo "psql tentativa $attempt/$max_attempts falhou, aguardando 3s..."
      attempt=$((attempt + 1))
      sleep 3
    done
    return 0
  }

  run_psql "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
      CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
    END IF;
  END \$\$;"

  echo "=== Entrypoint: concedendo privilégios ==="
  run_psql "GRANT ALL PRIVILEGES ON DATABASE \"${POSTGRES_DB:-echo_profiles}\" TO ${DB_USER};"
  run_psql "GRANT ALL ON SCHEMA public TO ${DB_USER};"

  echo "Role '$DB_USER' garantido."
fi

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/app.js
