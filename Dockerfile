# Echo API — Fastify + Prisma + Node.js 20
FROM node:20-alpine AS base

# Instalar dependências do sistema incluindo OpenSSL para o Prisma
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@latest && pnpm install

# Gerar cliente Prisma (precisa do OpenSSL e DATABASE_URL)
# DATABASE_URL dummy usado durante o build - Prisma generate não precisa
# de conexão real com o banco para gerar o cliente
# Usar file: para evitar tentativa de conexão de rede durante o build
FROM deps AS generator
WORKDIR /app
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
WORKDIR /app

ENV NODE_ENV=production

# Instalar OpenSSL na imagem de produção também
RUN apk add --no-cache libc6-compat openssl

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 echoapi

# Copiar aplicação buildada
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma/

# Criar diretório de uploads
RUN mkdir -p src/uploads && chown -R echoapi:nodejs src/uploads

USER echoapi

EXPOSE 3001

CMD ["node", "dist/server.js"]