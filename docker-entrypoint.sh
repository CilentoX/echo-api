#!/bin/sh
# Entrypoint: sincroniza tabelas e inicia a aplicação

echo "=== Entrypoint: criando/atualizando tabelas (db push) ==="
npx prisma db push --skip-generate --accept-data-loss

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/server.js
