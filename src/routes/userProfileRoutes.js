import Fastify from 'fastify'
import { authenticate } from '../plugins/auth.js'
import * as service from '../services/userProfileService.js'

/**
 * Registers user profile routes with the Fastify app.
 * Routes:
 *   GET /api/profiles/me - Get current user profile
 *   PATCH /api/profiles/me/nickname - Update user nickname
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerUserProfileRoutes(app) {
  /**
   * GET /api/profiles/me
   * Gets the current user's profile.
   * Requires authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get('/api/profiles/me', {}, authenticate, async (request, reply) => {
    const userId = request.user.userId

    const profile = await service.getNickname(userId)

    if (!profile) {
      reply.code(404).send({ error: 'Profile not found' })
      return
    }

    reply.send({
      userId: profile.userId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      bannerUrl: profile.bannerUrl,
      bio: profile.bio,
      links: profile.links,
    })
  })

  /**
   * PATCH /api/profiles/me/nickname
   * Updates the current user's nickname.
   * Expects `{ nickname }` in the request body.
   * Requires authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.patch(
    '/api/profiles/me/nickname',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nickname'],
          properties: {
            nickname: {
              type: 'string',
              minLength: 1,
              maxLength: 32,
            },
          },
        },
      },
    },
    authenticate,
    async (request, reply) => {
      const userId = request.user.userId
      const nickname = request.body.nickname

      try {
        const updatedProfile = await service.setNicknameWithSync(userId, request.user.accessToken, nickname)

        reply.send({
          userId: updatedProfile.userId,
          nickname: updatedProfile.nickname,
          avatarUrl: updatedProfile.avatarUrl,
          bannerUrl: updatedProfile.bannerUrl,
          bio: updatedProfile.bio,
          links: updatedProfile.links,
        })
      } catch (error) {
        reply.code(400).send({ error: error.message })
      }
    }
  )
}