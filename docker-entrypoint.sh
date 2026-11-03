#!/bin/sh
# Entrypoint: roda migrações Prisma e inicia a aplicação

echo "=== Entrypoint: rodando migrações Prisma ==="
npx prisma migrate deploy

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/server.js