FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Gera o cliente Prisma
RUN npx prisma generate

EXPOSE 3001

ENV NODE_ENV=production

# Executa migrações no start (banco disponível) e depois inicia o servidor
CMD sh -c "npx prisma migrate deploy && node src/server.js"
