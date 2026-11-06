import Fastify from 'fastify'
import { authenticate } from '../plugins/auth.js'
import { getMatrixClient } from '../lib/matrix/client.js'

/**
 * Registers real-time operation routes.
 * Routes:
 *   PUT /api/rooms/:roomId/typing - Send typing indicators
 *   PUT /api/rooms/:roomId/receipt - Send read receipt
 *   GET /api/users/:userId/presence - Get user presence
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerRealtimeRoutes(app) {
  /**
   * PUT /api/rooms/:roomId/typing
   * Sends typing indicators for a room.
   * Expects authentication via request.user.accessToken.
   * Body: { typing: boolean, timeout?: number }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.put(
    '/api/rooms/:roomId/typing',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { typing, timeout } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (typing === undefined) {
        reply.code(400).send({ error: 'Bad request: typing field required' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.sendTyping(roomId, typing, timeout)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * PUT /api/rooms/:roomId/receipt
   * Sends a read receipt for an event.
   * Expects authentication via request.user.accessToken.
   * Body: { eventId, receiptType?: 'm.read' }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.put(
    '/api/rooms/:roomId/receipt',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { eventId, receiptType } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (!eventId) {
        reply.code(400).send({ error: 'Bad request: eventId required' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.sendReadReceipt(roomId, eventId, receiptType)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * GET /api/users/:userId/presence
   * Gets the presence status for a user.
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get(
    '/api/users/:userId/presence',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.params
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        const presence = await matrixClient.getPresence(userId)
        reply.send(presence)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * PUT /api/users/me/presence & PUT /api/users/:userId/presence
   * Atualiza a presença do usuário conectado no Synapse (online, offline, unavailable).
   */
  const handleSetPresence = async (request, reply) => {
    const accessToken = request.user?.accessToken
    if (!accessToken) {
      reply.code(401).send({ error: 'Unauthorized: no access token' })
      return
    }

    const { presence = 'online', statusMsg } = request.body || {}
    const validStates = ['online', 'offline', 'unavailable']
    const normalized = validStates.includes(presence) ? presence : 'online'

    try {
      const matrixClient = await getMatrixClient(request.user.userId, accessToken)
      await matrixClient.setPresence({
        presence: normalized,
        status_msg: statusMsg || undefined,
      })
      reply.send({ success: true, presence: normalized })
    } catch (error) {
      reply.code(500).send({ error: error.message })
    }
  }

  app.put('/api/users/me/presence', { preHandler: authenticate }, handleSetPresence)
  app.put('/api/users/:userId/presence', { preHandler: authenticate }, handleSetPresence)
}