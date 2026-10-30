# Echo API
API própria para perfis de usuário e guildas do Echo, rodando no Coolify + PostgreSQL.

## Endpoints

### Perfis de Usuário
- `GET /api/profiles/:userId` — Busca perfil do usuário
- `PATCH /api/profiles/:userId` — Atualiza perfil do usuário (avatar, banner, bio, links)

### Perfis de Guilda
- `GET /api/guilds/:guildId/profile` — Busca perfil da guilda
- `PATCH /api/guilds/:guildId/profile` — Atualiza perfil da guilda (nome, descrição, avatar, banner)

### Upload de Arquivos
- `POST /api/upload` — Faz upload de imagem (avatar/banner)
- `DELETE /api/upload/:fileId` — Remove arquivo

## Autenticação
Todas as rotas requerem header `X-API-Key` com a chave configurada em `API_KEY`.

## Variáveis de Ambiente
Veja `.env.example`.
