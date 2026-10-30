FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Gera o cliente Prisma
RUN npx prisma generate

# Executa migrações no build
RUN npx prisma migrate deploy

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
