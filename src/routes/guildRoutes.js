import { authenticate } from '../plugins/auth.js'
import { guildProfileService } from '../services/guildProfileService.js'

/**
 * Registers all Guild, Channel, and Invite routes for Echo API.
 * Supports both /guilds and /api/guilds, /channels and /api/channels, /invites and /api/invites.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerGuildRoutes(app) {
  // ── Guilds Endpoints ──────────────────────────────────────────────

  const handleListGuilds = async (request, reply) => {
    try {
      const guilds = await guildProfileService.listGuilds({
        userId: request.user?.userId,
        accessToken: request.user?.accessToken,
      })
      return reply.code(200).send(guilds)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao buscar guildas' })
    }
  }

  app.get('/guilds', { preHandler: authenticate }, handleListGuilds)
  app.get('/api/guilds', { preHandler: authenticate }, handleListGuilds)

  const handleCreateGuild = async (request, reply) => {
    try {
      const { name, iconUrl, avatarUrl, bannerUrl, description, createdBy } = request.body || {}
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'Nome da guilda é obrigatório' })
      }

      const guild = await guildProfileService.createGuild({
        name: name.trim(),
        iconUrl: iconUrl || avatarUrl,
        bannerUrl,
        description,
        createdBy,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })

      return reply.code(201).send(guild)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao criar guilda: ' + (err.message || 'desconhecido') })
    }
  }

  app.post('/guilds', { preHandler: authenticate }, handleCreateGuild)
  app.post('/api/guilds', { preHandler: authenticate }, handleCreateGuild)

  const handleDeleteGuild = async (request, reply) => {
    try {
      const { guildId } = request.params
      const result = await guildProfileService.deleteGuild({
        guildId,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao deletar guilda' })
    }
  }

  app.delete('/guilds/:guildId', { preHandler: authenticate }, handleDeleteGuild)
  app.delete('/api/guilds/:guildId', { preHandler: authenticate }, handleDeleteGuild)

  const handleLeaveGuild = async (request, reply) => {
    try {
      const { guildId } = request.params
      const result = await guildProfileService.leaveGuild({
        guildId,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao sair da guilda' })
    }
  }

  app.post('/guilds/:guildId/leave', { preHandler: authenticate }, handleLeaveGuild)
  app.post('/api/guilds/:guildId/leave', { preHandler: authenticate }, handleLeaveGuild)

  // ── Channels Endpoints ────────────────────────────────────────────

  const handleGetChannels = async (request, reply) => {
    try {
      const guildId = request.query?.guildId
      if (!guildId) {
        return reply.code(400).send({ error: 'guildId é obrigatório' })
      }
      const channels = await guildProfileService.getChannels(guildId)
      return reply.code(200).send(channels)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao buscar canais' })
    }
  }

  app.get('/channels', { preHandler: authenticate }, handleGetChannels)
  app.get('/api/channels', { preHandler: authenticate }, handleGetChannels)

  const handleCreateChannel = async (request, reply) => {
    try {
      const guildId = request.query?.guildId || request.body?.guildId
      const { name, type, topic, category } = request.body || {}
      if (!guildId) {
        return reply.code(400).send({ error: 'guildId é obrigatório' })
      }
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'Nome do canal é obrigatório' })
      }

      const channel = await guildProfileService.createChannel({
        guildId,
        name: name.trim(),
        type: type || 'text',
        topic,
        category,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })

      return reply.code(201).send(channel)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao criar canal: ' + (err.message || 'desconhecido') })
    }
  }

  app.post('/channels', { preHandler: authenticate }, handleCreateChannel)
  app.post('/api/channels', { preHandler: authenticate }, handleCreateChannel)

  // ── Invites Endpoints ─────────────────────────────────────────────

  const handleCreateInvite = async (request, reply) => {
    try {
      const { guildId } = request.params
      const { maxUses, expiresInHours } = request.body || {}

      const invite = await guildProfileService.createInvite({
        guildId,
        creatorId: request.user.userId,
        maxUses,
        expiresInHours,
      })

      return reply.code(201).send(invite)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao gerar convite' })
    }
  }

  app.post('/guilds/:guildId/invites', { preHandler: authenticate }, handleCreateInvite)
  app.post('/api/guilds/:guildId/invites', { preHandler: authenticate }, handleCreateInvite)

  const handleGetInvite = async (request, reply) => {
    try {
      const { code } = request.params
      const result = await guildProfileService.getInvitePreview(code)
      if (result.error) {
        return reply.code(result.status || 400).send({ error: result.error })
      }
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao consultar convite' })
    }
  }

  app.get('/invites/:code', handleGetInvite)
  app.get('/api/invites/:code', handleGetInvite)

  const handleJoinInvite = async (request, reply) => {
    try {
      const { code } = request.params
      const result = await guildProfileService.joinGuildViaInvite({
        code,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      if (result.error) {
        return reply.code(result.status || 400).send({ error: result.error })
      }
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao entrar na guilda via convite' })
    }
  }

  app.post('/invites/:code/join', { preHandler: authenticate }, handleJoinInvite)
  app.post('/api/invites/:code/join', { preHandler: authenticate }, handleJoinInvite)
}

