#!/bin/sh
# Entrypoint: roda prisma db push (cria tabelas sem migrations) e inicia a aplicação

echo "=== Entrypoint: gerando Prisma Client ==="
npx prisma generate

echo "=== Entrypoint: criando/atualizando tabelas (db push) ==="
npx prisma db push --accept-data-loss

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/server.js