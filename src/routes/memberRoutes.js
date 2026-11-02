import Fastify from 'fastify'
import { authenticate } from '../plugins/auth.js'
import { getMatrixClient } from '../lib/matrix/client.js'

/**
 * Registers member management routes.
 * Routes:
 *   GET /api/rooms/:roomId/members - List joined room members
 *   POST /api/rooms/:roomId/invite - Invite a user to a room
 *   POST /api/rooms/:roomId/kick - Kick a user from a room
 *   POST /api/rooms/:roomId/ban - Ban a user from a room
 *   PUT /api/rooms/:roomId/power-levels - Set power levels in a room
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerMemberRoutes(app) {
  /**
   * GET /api/rooms/:roomId/members
   * Lists joined members of a room using the Matrix client.
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get(
    '/api/rooms/:roomId/members',
    {},
    authenticate,
    async (request, reply) => {
      const { roomId } = request.params
      const userId = request.query.userId
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        const members = await matrixClient.getJoinedRoomMembers(roomId)
        reply.send(members)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * POST /api/rooms/:roomId/invite
   * Invites a user to a room.
   * Expects authentication via request.user.accessToken.
   * Body: { userId }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/rooms/:roomId/invite',
    {},
    authenticate,
    async (request, reply) => {
      const { roomId } = request.params
      const { userId } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (!userId) {
        reply.code(400).send({ error: 'Bad request: no userId provided' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.invite(roomId, userId)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * POST /api/rooms/:roomId/kick
   * Kicks a user from a room.
   * Expects authentication via request.user.accessToken.
   * Body: { userId, reason? }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/rooms/:roomId/kick',
    {},
    authenticate,
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, reason } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (!userId) {
        reply.code(400).send({ error: 'Bad request: no userId provided' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.kick(roomId, userId, reason)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * POST /api/rooms/:roomId/ban
   * Bans a user from a room.
   * Expects authentication via request.user.accessToken.
   * Body: { userId, reason? }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/rooms/:roomId/ban',
    {},
    authenticate,
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, reason } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (!userId) {
        reply.code(400).send({ error: 'Bad request: no userId provided' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.ban(roomId, userId, reason)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * PUT /api/rooms/:roomId/power-levels
   * Sets power levels in a room.
   * Expects authentication via request.user.accessToken.
   * Body: { userId, powerLevel }
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.put(
    '/api/rooms/:roomId/power-levels',
    {},
    authenticate,
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, powerLevel } = request.body
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      if (!userId || powerLevel === undefined) {
        reply.code(400).send({ error: 'Bad request: userId and powerLevel required' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        await matrixClient.setPowerLevel(roomId, userId, powerLevel)
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )
}