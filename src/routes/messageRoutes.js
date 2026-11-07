import Fastify from 'fastify'
import {
  sendMessage,
  editMessage,
  redactMessage,
  reactToMessage,
  getOlderMessages,
} from '../services/messageService.js'
import { authenticate } from '../plugins/auth.js'

/**
 * Registers message routes with the Fastify app.
 * Routes:
 *   GET  /api/rooms/:roomId/messages/older - Load older channel message history
 *   POST /api/rooms/:roomId/messages - Send a message (text, file, image, audio)
 *   PUT /api/rooms/:roomId/messages/:eventId - Edit a message (m.replace)
 *   DELETE /api/rooms/:roomId/messages/:eventId - Redact a message
 *   POST /api/rooms/:roomId/messages/:eventId/reactions - React to a message (m.reaction)
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerMessageRoutes(app) {
  /**
   * GET /api/rooms/:roomId/messages/older
   * Loads older messages from Matrix Synapse for a room.
   */
  const handleOlderMessages = async (request, reply) => {
    const { roomId } = request.params
    const limit = parseInt(request.query?.limit, 10) || 20
    const from = request.query?.from
    const userId = request.user?.userId
    const accessToken = request.user?.accessToken

    if (!userId || !accessToken) {
      reply.code(401).send({ error: 'Unauthorized: no access token' })
      return
    }

    try {
      const messages = await getOlderMessages(roomId, {
        limit,
        from,
        accessToken,
        userId,
      })
      reply.send(messages)
    } catch (error) {
      reply.code(500).send({ error: error.message })
    }
  }

  app.get('/api/rooms/:roomId/messages/older', { preHandler: authenticate }, handleOlderMessages)
  app.get('/rooms/:roomId/messages/older', { preHandler: authenticate }, handleOlderMessages)

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
  const handleSendMessage = async (request, reply) => {
    const { roomId } = request.params
    const { body, msgtype, mediaId } = request.body || {}
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

  app.post('/api/rooms/:roomId/messages', { preHandler: authenticate }, handleSendMessage)
  app.post('/rooms/:roomId/messages', { preHandler: authenticate }, handleSendMessage)

  /**
   * PUT /api/rooms/:roomId/messages/:eventId
   * Edits a message in a Matrix room (m.replace).
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  const handleEditMessage = async (request, reply) => {
    const { roomId, eventId } = request.params
    const { body } = request.body || {}
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

  app.put('/api/rooms/:roomId/messages/:eventId', { preHandler: authenticate }, handleEditMessage)
  app.put('/rooms/:roomId/messages/:eventId', { preHandler: authenticate }, handleEditMessage)

  /**
   * DELETE /api/rooms/:roomId/messages/:eventId
   * Redacts a message in a Matrix room.
   * Expects authentication via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  const handleDeleteMessage = async (request, reply) => {
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

  app.delete('/api/rooms/:roomId/messages/:eventId', { preHandler: authenticate }, handleDeleteMessage)
  app.delete('/rooms/:roomId/messages/:eventId', { preHandler: authenticate }, handleDeleteMessage)
  app.put('/api/rooms/:roomId/redact/:eventId', { preHandler: authenticate }, handleDeleteMessage)
  app.put('/rooms/:roomId/redact/:eventId', { preHandler: authenticate }, handleDeleteMessage)

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
  const handleReactToMessage = async (request, reply) => {
    const { roomId, eventId } = request.params
    const { key } = request.body || {}
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

  app.post('/api/rooms/:roomId/messages/:eventId/reactions', { preHandler: authenticate }, handleReactToMessage)
  app.post('/rooms/:roomId/messages/:eventId/reactions', { preHandler: authenticate }, handleReactToMessage)
}