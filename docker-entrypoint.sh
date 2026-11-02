#!/bin/sh
# Entrpoint: inicia a API diretamente.
# O Prisma/lazy connection lida com o banco na primeira requisição.

echo "=== Entrypoint: iniciando a aplicação ==="
exec node dist/server.js