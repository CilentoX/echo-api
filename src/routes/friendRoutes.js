import { authenticate } from '../plugins/auth.js'
import * as friendService from '../services/friendService.js'

/**
 * Registers all Friend and Direct Message routes for Echo API.
 * Supports both /api/friends and /friends prefix.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerFriendRoutes(app) {
  const getDb = (request) => {
    return typeof request.prisma === 'function' ? request.prisma() : undefined
  }

  const handleList = async (request, reply) => {
    try {
      const db = getDb(request)
      const data = await friendService.listFriends(request.user.userId, db)
      return reply.code(200).send(data)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 500
      return reply.code(status).send({ error: err.message || 'Erro ao listar amigos' })
    }
  }

  app.get('/friends', { preHandler: authenticate }, handleList)
  app.get('/api/friends', { preHandler: authenticate }, handleList)

  const handleDiscover = async (request, reply) => {
    try {
      const db = getDb(request)
      const query = request.query?.q || request.query?.search || ''
      const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50
      const data = await friendService.discoverUsers(request.user.userId, { query, limit }, db)
      return reply.code(200).send(data)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 500
      return reply.code(status).send({ error: err.message || 'Erro ao buscar usuários para descobrimento' })
    }
  }

  app.get('/friends/discover', { preHandler: authenticate }, handleDiscover)
  app.get('/api/friends/discover', { preHandler: authenticate }, handleDiscover)

  const handleSendRequest = async (request, reply) => {
    try {
      const db = getDb(request)
      const body = request.body || {}
      const target = body.target || body.userId || body.username || body.nickname
      if (!target) {
        return reply.code(400).send({ error: 'Campo "target", "username" ou "nickname" é obrigatório' })
      }
      const result = await friendService.sendFriendRequest(request.user.userId, target, db)
      return reply.code(result.autoAccepted ? 200 : 201).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || (err.message.includes('não encontrado') ? 404 : 400)
      return reply.code(status).send({ error: err.message || 'Erro ao enviar pedido de amizade' })
    }
  }

  app.post('/friends/request', { preHandler: authenticate }, handleSendRequest)
  app.post('/api/friends/request', { preHandler: authenticate }, handleSendRequest)

  const handleAccept = async (request, reply) => {
    try {
      const db = getDb(request)
      const result = await friendService.acceptFriendRequest(request.user.userId, request.params.id, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao aceitar solicitação' })
    }
  }

  app.post('/friends/:id/accept', { preHandler: authenticate }, handleAccept)
  app.post('/api/friends/:id/accept', { preHandler: authenticate }, handleAccept)

  const handleDecline = async (request, reply) => {
    try {
      const db = getDb(request)
      const result = await friendService.declineFriendRequest(request.user.userId, request.params.id, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao recusar solicitação' })
    }
  }

  app.post('/friends/:id/decline', { preHandler: authenticate }, handleDecline)
  app.post('/api/friends/:id/decline', { preHandler: authenticate }, handleDecline)

  const handleCancel = async (request, reply) => {
    try {
      const db = getDb(request)
      const result = await friendService.cancelFriendRequest(request.user.userId, request.params.id, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao cancelar solicitação' })
    }
  }

  app.post('/friends/:id/cancel', { preHandler: authenticate }, handleCancel)
  app.post('/api/friends/:id/cancel', { preHandler: authenticate }, handleCancel)

  const handleRemove = async (request, reply) => {
    try {
      const db = getDb(request)
      const result = await friendService.removeFriend(request.user.userId, request.params.id, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao desfazer amizade' })
    }
  }

  app.delete('/friends/:id', { preHandler: authenticate }, handleRemove)
  app.delete('/api/friends/:id', { preHandler: authenticate }, handleRemove)

  const handleBlock = async (request, reply) => {
    try {
      const db = getDb(request)
      const targetUserId = request.body?.targetUserId || request.params.id
      if (!targetUserId) {
        return reply.code(400).send({ error: 'targetUserId é obrigatório' })
      }
      const result = await friendService.blockUser(request.user.userId, targetUserId, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao bloquear usuário' })
    }
  }

  app.post('/friends/:id/block', { preHandler: authenticate }, handleBlock)
  app.post('/api/friends/:id/block', { preHandler: authenticate }, handleBlock)
  app.post('/friends/block', { preHandler: authenticate }, handleBlock)
  app.post('/api/friends/block', { preHandler: authenticate }, handleBlock)

  const handleUnblock = async (request, reply) => {
    try {
      const db = getDb(request)
      const target = request.body?.targetUserId || request.params.id
      const result = await friendService.unblockUser(request.user.userId, target, db)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 400
      return reply.code(status).send({ error: err.message || 'Erro ao desbloquear usuário' })
    }
  }

  app.post('/friends/:id/unblock', { preHandler: authenticate }, handleUnblock)
  app.post('/api/friends/:id/unblock', { preHandler: authenticate }, handleUnblock)

  const handleDirectRoom = async (request, reply) => {
    try {
      const db = getDb(request)
      const targetUserId = request.body?.targetUserId
      if (!targetUserId) {
        return reply.code(400).send({ error: 'targetUserId é obrigatório' })
      }
      const result = await friendService.getOrCreateDirectRoom(
        request.user.userId,
        targetUserId,
        request.user.accessToken,
        db
      )
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      const status = err.statusCode || 500
      return reply.code(status).send({ error: err.message || 'Erro ao criar ou obter sala direta' })
    }
  }

  app.post('/friends/dm', { preHandler: authenticate }, handleDirectRoom)
  app.post('/api/friends/dm', { preHandler: authenticate }, handleDirectRoom)
}

