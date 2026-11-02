# Echo API

API própria para perfis de usuário e guildas do Echo, rodando no Coolify + PostgreSQL.
Substitui completamente o Appwrite.

## Stack

- **Fastify** — Framework web Node.js rápido e com baixo overhead
- **Prisma** — ORM moderno com TypeScript-like schema e migrations
- **PostgreSQL 16** — Banco de dados relacional (mesmo cluster do Synapse, banco separado)
- **Docker** — Containerização para deploy no Coolify

## Endpoints

### Perfis de Usuário
- `GET /api/profiles/:userId` — Busca perfil do usuário (por MXID)
- `PATCH /api/profiles/:userId` — Atualiza perfil (avatar, banner, bio, links)

### Perfis de Guilda
- `GET /api/guilds/:guildId/profile` — Busca perfil da guilda (por guildId)
- `PATCH /api/guilds/:guildId/profile` — Atualiza perfil da guilda (nome, descrição, avatar, banner)

### Upload de Arquivos
- `POST /api/upload` — Faz upload de imagem (avatar/banner)
- `DELETE /api/upload/:fileId` — Remove arquivo

### Health
- `GET /health` — Health check

## Autenticação

Todas as rotas (exceto `/health`) requerem header `X-API-Key` com a chave configurada em `API_KEY`.

## Banco de Dados

### Tabelas

| Tabela | Chave Primária | Campos principais |
|--------|---------------|-------------------|
| `user_profiles` | `id` (uuid) | userId (MXID, único), avatarUrl, bannerUrl, bio, links (JSON), createdAt, updatedAt |
| `guild_profiles` | `id` (uuid) | guildId (Matrix roomId, único), name, description, avatarUrl, bannerUrl, createdBy (MXID), createdAt, updatedAt |

### Acesso externo via DBeaver

O PostgreSQL está exposto na porta **5432** do host para acesso externo.

**Configuração no DBeaver:**
- **Host:** IP da sua VPS
- **Porta:** 5432
- **Banco de dados:** `echo_profiles` (ou o definido em `POSTGRES_DB`)
- **Usuário:** `echo_api` (ou o definido em `POSTGRES_USER`)
- **Senha:** a definida em `POSTGRES_PASSWORD`

**String de conexão (DATABASE_URL):**
```
postgresql://echo_api:sua_senha@IP_DA_VPS:5432/echo_profiles?schema=public
```

## Variáveis de Ambiente

Veja `.env.example`.

## Deploy no Coolify

1. Crie o volume externo `echo_api_uploads` no Coolify
2. Crie o volume externo `echo_api_db_data` no Coolify
3. Defina as variáveis de ambiente: `DATABASE_URL`, `API_KEY`, `PUBLIC_BASE_URL`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`
4. Deploy usando o `docker-compose-api.yml`
5. O banco será acessível externamente na porta 5432

## Estrutura do Projeto

```
echo-api/
├── prisma/
│   └── schema.prisma          # Schema do Prisma (user_profiles, guild_profiles)
├── src/
│   ├── server.js              # Entry point Fastify
│   ├── app.js                 # Configuração do app com plugins e rotas
│   ├── lib/
│   │   └── prisma.js          # Singleton do cliente Prisma
│   ├── plugins/
│   │   └── auth.js            # Middleware de autenticação por API Key
│   ├── routes/
│   │   ├── userProfileRoutes.js
│   │   ├── guildProfileRoutes.js
│   │   └── uploadRoutes.js
│   ├── services/
│   │   ├── userProfileService.js
│   │   ├── guildProfileService.js
│   │   └── uploadService.js
│   └── uploads/               # Imagens armazenadas localmente
├── docker-compose-api.yml     # Docker Compose para Coolify
├── Dockerfile
├── .env.example
├── package.json
└── README.md
```

## Fluxo de Dados

```
Usuário/Guilda faz upload de imagem
    → POST /api/upload → salva em ./src/uploads/
    → Retorna URL pública (https://api.echo.litteris.online/uploads/xxx.png)
    → PATCH /api/profiles/:userId ou /api/guilds/:guildId/profile
    → Salvo no PostgreSQL (tabela user_profiles ou guild_profiles)
```
