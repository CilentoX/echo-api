# Echo API — Fastify + Prisma + Node.js 22
FROM node:22-slim AS base

# Instalar dependências do sistema incluindo OpenSSL para o Prisma
# postgresql-client para pg_isready/psql no entrypoint e curl para healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends openssl postgresql-client curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Stage de dependências — instalar com scripts para que @prisma/engines
# e os binários nativos do Prisma sejam baixados corretamente
# pnpm 11 requer approve-builds para permitir scripts de build do Prisma
FROM base AS deps
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN npm install -g pnpm@latest && pnpm approve-builds @prisma/client @prisma/engines prisma && pnpm install

# Gerar cliente Prisma (precisa do OpenSSL e DATABASE_URL)
# DATABASE_URL dummy usado durante o build - Prisma generate não precisa
# de conexão real com o banco para gerar o cliente
FROM deps AS generator
COPY prisma ./prisma/
ARG DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm prisma generate

# Build da aplicação
FROM generator AS builder
WORKDIR /app
COPY . .
RUN pnpm build

# Imagem de produção
FROM base AS runner
ENV NODE_ENV=production

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 echoapi

# Copiar aplicação buildada
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma/

# Criar diretório de uploads e ajustar permissões da aplicação
RUN mkdir -p src/uploads && chown -R echoapi:nodejs /app

# Copiar entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER echoapi

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -f http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
