import Fastify from 'fastify'
import { sendMessage } from '../services/messageService.js'
import { editMessage } from '../services/messageService.js'
import { redactMessage } from '../services/messageService.js'
import { reactToMessage } from '../services/messageService.js'

/**
 * Registers message routes with the Fastify app.
 * Routes:
 *   POST /api/rooms/:roomId/messages - Send a message (text, file, image, audio)
 *   PUT /api/rooms/:roomId/messages/:eventId - Edit a message (m.replace)
 *   DELETE /api/rooms/:roomId/messages/:eventId - Redact a message
 *   POST /api/rooms/:roomId/messages/:eventId/reactions - React to a message (m.reaction)
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerMessageRoutes(app) {
  /**
   * POST /api/rooms/:roomId/messages
   * Sends a message to a Matrix room.
   * Expects authentication via request.user.accessToken.
   * Body: { body, msgtype?, mediaId? }
   *   - body: The message text/content
   *   - msgtype: 'm.text', 'm.file', 'm.image', 'm.audio' (default: m.text)
   *   - mediaId: Optional media ID for file/image/audio messages (resolved to mxcUri via chatMediaService)
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/rooms/:roomId/messages',
    {},
    async (request, reply) => {
      const { roomId } = request.params
      const { body, msgtype, mediaId } = request.body
      const userId = request.user?.userId
      const accessToken = request.user?.accessToken

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized: no user ID' })
        return
      }

      if (!body) {
        reply.code(400).send({ error: 'Bad request: no body provided' })
        return
      }

      try {
        const result = await sendMessage(roomId, {
          body,
          msgtype,
          mediaId,
          accessToken,
          userId,
        })

        reply.send(result)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * PUT /api/rooms/:roomId/messages/:eventId
   * Edits a message in a Matrix room (m.replace).
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.put(
    '/api/rooms/:roomId/messages/:eventId',
    {},
    async (request, reply) => {
      const { roomId, eventId } = request.params
      const { body } = request.body
      const userId = request.user?.userId
      const accessToken = request.user?.accessToken

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized: no user ID' })
        return
      }

      if (!body) {
        reply.code(400).send({ error: 'Bad request: no body provided' })
        return
      }

      try {
        const result = await editMessage(roomId, eventId, {
          body,
          accessToken,
          userId,
        })

        reply.send(result)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * DELETE /api/rooms/:roomId/messages/:eventId
   * Redacts a message in a Matrix room.
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.delete(
    '/api/rooms/:roomId/messages/:eventId',
    {},
    async (request, reply) => {
      const { roomId, eventId } = request.params
      const userId = request.user?.userId
      const accessToken = request.user?.accessToken

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized: no user ID' })
        return
      }

      try {
        const result = await redactMessage(roomId, eventId, {
          accessToken,
          userId,
        })

        reply.send(result)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )

  /**
   * POST /api/rooms/:roomId/messages/:eventId/reactions
   * Reacts to a message in a Matrix room (m.reaction with m.relates_to).
   * Expects authentication via request.user.accessToken.
   * Body: { key } - The reaction key (e.g., "m.emote", "👍", ":thumbsup:")
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/rooms/:roomId/messages/:eventId/reactions',
    {},
    async (request, reply) => {
      const { roomId, eventId } = request.params
      const { key } = request.body
      const userId = request.user?.userId
      const accessToken = request.user?.accessToken

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized: no user ID' })
        return
      }

      if (!key) {
        reply.code(400).send({ error: 'Bad request: no reaction key provided' })
        return
      }

      try {
        const result = await reactToMessage(roomId, eventId, {
          key,
          accessToken,
          userId,
        })

        reply.send(result)
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    }
  )
}