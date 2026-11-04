import { authenticate } from '../plugins/auth.js'
import * as service from '../services/userProfileService.js'

/**
 * Registers user profile routes with the Fastify app.
 * Routes:
 *   GET /api/profiles/me - Get current user profile
 *   PATCH /api/profiles/me - Update current user profile
 *   PATCH /api/profiles/me/nickname - Update user nickname (backward compatibility)
 *   GET /api/profiles/:userId - Get profile of a specific user
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerUserProfileRoutes(app) {
  /**
   * GET /api/profiles/me
   * Gets the current user's profile.
   * Requires authentication via request.user.accessToken.
   */
  app.get(
    '/api/profiles/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.user.userId

      let profile = await service.getProfile(userId)
      const fallbackUsername = userId ? userId.replace(/^@/, '').split(':')[0] : 'usuario'

      if (!profile) {
        // Return default profile rather than 404 for newly logged-in user
        reply.send({
          userId,
          username: fallbackUsername,
          nickname: null,
          displayName: null,
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
          links: [],
        })
        return
      }

      reply.send({
        userId: profile.userId,
        username: profile.username || fallbackUsername,
        nickname: profile.nickname,
        displayName: profile.nickname,
        avatarUrl: profile.avatarUrl,
        bannerUrl: profile.bannerUrl,
        bio: profile.bio,
        links: profile.links || [],
      })
    }
  )

  /**
   * GET /api/profiles/check-username
   * Checks if a username is valid and available.
   */
  app.get(
    '/api/profiles/check-username',
    { preHandler: authenticate },
    async (request, reply) => {
      const { username } = request.query || {}
      const currentUserId = request.user?.userId

      if (!username || typeof username !== 'string') {
        reply.code(400).send({ error: 'Parâmetro username é obrigatório' })
        return
      }

      const result = await service.isUsernameAvailable(username, currentUserId)
      reply.send(result)
    }
  )

  /**
   * GET /api/profiles/:userId
   * Gets any user's public profile.
   */
  app.get(
    '/api/profiles/:userId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.params

      const profile = await service.getProfile(userId)
      const fallbackUsername = userId ? userId.replace(/^@/, '').split(':')[0] : 'usuario'

      if (!profile) {
        reply.code(404).send({ error: 'Profile not found' })
        return
      }

      reply.send({
        userId: profile.userId,
        username: profile.username || fallbackUsername,
        nickname: profile.nickname,
        displayName: profile.nickname,
        avatarUrl: profile.avatarUrl,
        bannerUrl: profile.bannerUrl,
        bio: profile.bio,
        links: profile.links || [],
      })
    }
  )

  /**
   * PATCH /api/profiles/me
   * Updates fields of the current user's profile.
   * Accepts { nickname, displayName, avatarUrl, bannerUrl, bio, links } or { data: { ... } }
   */
  app.patch(
    '/api/profiles/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.user.userId
      const body = request.body || {}
      // Support both flat body and nested { data: { ... } }
      const payload = body.data ? { ...body.data } : { ...body }
      if (!payload.nickname && body.nickname) payload.nickname = body.nickname
      if (!payload.nickname && body.displayName) payload.nickname = body.displayName
      if (!payload.nickname && payload.displayName) payload.nickname = payload.displayName

      try {
        const updatedProfile = await service.updateProfile(
          userId,
          payload,
          request.user.accessToken
        )

        const fallbackUsername = userId ? userId.replace(/^@/, '').split(':')[0] : 'usuario'
        reply.send({
          userId: updatedProfile.userId,
          username: updatedProfile.username || fallbackUsername,
          nickname: updatedProfile.nickname,
          displayName: updatedProfile.nickname,
          avatarUrl: updatedProfile.avatarUrl,
          bannerUrl: updatedProfile.bannerUrl,
          bio: updatedProfile.bio,
          links: updatedProfile.links || [],
        })
      } catch (error) {
        reply.code(400).send({ error: error.message })
      }
    }
  )

  /**
   * PATCH /api/profiles/me/nickname
   * Updates the current user's nickname.
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
      preHandler: authenticate,
    },
    async (request, reply) => {
      const userId = request.user.userId
      const body = request.body || {}
      // Handle { nickname } or { data: { nickname } }
      const nickname = body.nickname || (body.data && body.data.nickname)

      if (!nickname && nickname !== '') {
        reply.code(400).send({ error: 'nickname field required' })
        return
      }

      try {
        const updatedProfile = await service.setNicknameWithSync(
          userId,
          request.user.accessToken,
          nickname
        )

        reply.send({
          userId: updatedProfile.userId,
          nickname: updatedProfile.nickname,
          avatarUrl: updatedProfile.avatarUrl,
          bannerUrl: updatedProfile.bannerUrl,
          bio: updatedProfile.bio,
          links: updatedProfile.links || [],
        })
      } catch (error) {
        reply.code(400).send({ error: error.message })
      }
    }
  )

  /**
   * DELETE /api/profiles/me
   * Deletes the current user's profile and token data (reset account).
   */
  app.delete(
    '/api/profiles/me',
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.user.userId
      try {
        await service.deleteProfile(userId)
        reply.send({ success: true, message: 'Perfil e conta excluídos com sucesso' })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )
}
