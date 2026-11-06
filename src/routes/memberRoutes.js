import { authenticate } from '../plugins/auth.js'
import { getMatrixClient } from '../lib/matrix/client.js'
import { prisma } from '../db.js'

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
   * Normalizes the response into an array of { userId, displayName, avatarUrl, presence }.
   */
  app.get(
    '/api/rooms/:roomId/members',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const accessToken = request.user?.accessToken

      if (!accessToken) {
        reply.code(401).send({ error: 'Unauthorized: no access token' })
        return
      }

      try {
        const matrixClient = await getMatrixClient(request.user.userId, accessToken)
        const membersData = await matrixClient.getJoinedRoomMembers(roomId)
        const joined = membersData?.joined || {}
        const userIds = Object.keys(joined)

        // Busca perfis salvos no PostgreSQL para carregar o avatarUrl e apelido corretos do Echo
        let profileMap = new Map()
        if (userIds.length > 0) {
          try {
            const profiles = await prisma.userProfile.findMany({
              where: { userId: { in: userIds } },
            })
            profileMap = new Map(profiles.map((p) => [p.userId, p]))
          } catch (dbErr) {
            request.log?.warn?.('[memberRoutes] Failed to fetch user profiles from DB:', dbErr.message)
          }
        }

        const result = await Promise.all(
          Object.entries(joined).map(async ([userId, data]) => {
            const prof = profileMap.get(userId)
            let presence = 'offline'

            // O usuário autenticado da sessão atual está sempre online
            if (userId === request.user.userId) {
              presence = 'online'
            } else {
              try {
                const p = await matrixClient.getPresence(userId)
                if (p?.presence === 'online' || p?.presence === 'unavailable') {
                  presence = p.presence
                }
              } catch {
                presence = 'offline'
              }
            }

            return {
              userId,
              displayName: prof?.nickname || data?.display_name || prof?.username || userId.replace(/^@/, '').split(':')[0],
              avatarUrl: prof?.avatarUrl || data?.avatar_url || null,
              presence,
            }
          })
        )
        reply.send(result)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * POST /api/rooms/:roomId/invite
   * Invites a user to a room.
   */
  app.post(
    '/api/rooms/:roomId/invite',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { userId } = request.body || {}
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
   */
  app.post(
    '/api/rooms/:roomId/kick',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, reason } = request.body || {}
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
   */
  app.post(
    '/api/rooms/:roomId/ban',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, reason } = request.body || {}
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
   */
  app.put(
    '/api/rooms/:roomId/power-levels',
    { preHandler: authenticate },
    async (request, reply) => {
      const { roomId } = request.params
      const { userId, powerLevel } = request.body || {}
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
