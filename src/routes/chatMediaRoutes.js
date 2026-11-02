import Fastify from 'fastify'
import fs from 'fs'
import path from 'path'
import { saveChatMedia } from '../services/chatMediaService.js'
import { getChatMedia } from '../services/chatMediaService.js'
import { deleteChatMedia } from '../services/chatMediaService.js'

/**
 * Registers chat media routes with the Fastify app.
 * Routes:
 *   POST /api/media/chat - Upload chat media (multipart)
 *   GET /api/media/chat/:mediaId - Retrieve chat media file
 *   DELETE /api/media/chat/:mediaId - Delete chat media
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerChatMediaRoutes(app) {
  /**
   * POST /api/media/chat
   * Uploads a chat media file with dual-write (Echo API primary + Synapse mirror).
   * Expects multipart/form-data with a "file" field and optional "roomId" field.
   * Also expects user to be authenticated via request.user.accessToken.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post(
    '/api/media/chat',
    {},
    async (request, reply) => {
      const { file, roomId } = request.body
      const userId = request.user?.userId

      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized: no user ID' })
        return
      }

      if (!file) {
        reply.code(400).send({ error: 'Bad request: no file provided' })
        return
      }

      try {
        const result = await saveChatMedia({
          userId,
          file,
          roomId,
        })

        reply.code(201).send(result)
      } catch (error) {
        reply.code(400).send({ error: error.message })
      }
    }
  )

  /**
   * GET /api/media/chat/:mediaId
   * Serves a chat media file from Echo API storage.
   * Supports range requests for audio streaming.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get('/api/media/chat/:mediaId', async (request, reply) => {
    const { mediaId } = request.params

    const userId = request.user?.userId
    if (!userId) {
      reply.code(401).send({ error: 'Unauthorized: no user ID' })
      return
    }

    const userPath = userId.replace(/^@/, '').replace(/:/, '@')
    const filePath = path.join(
      process.cwd(),
      'uploads',
      'chat',
      userPath,
      `${mediaId}.file`
    )

    // Check if file exists
    try {
      await fs.promises.access(filePath)
    } catch {
      reply.code(404).send({ error: 'Media not found' })
      return
    }

    const stat = await fs.promises.stat(filePath)
    const fileSize = stat.size
    const range = request.headers.range

    // Handle range requests for audio streaming
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

      if (start >= fileSize) {
        reply.code(416).send({ error: 'Range not satisfiable' })
        return
      }

      const chunksize = end - start + 1
      const readStream = fs.createReadStream(filePath, { start, end })

      reply.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/octet-stream',
      })

      readStream.pipe(reply)
      return
    }

    // Serve the full file
    reply.sendFile(filePath)
  })

  /**
   * DELETE /api/media/chat/:mediaId
   * Deletes a chat media file from Echo API storage and attempts Synapse redaction.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.delete('/api/media/chat/:mediaId', async (request, reply) => {
    const { mediaId } = request.params
    const userId = request.user?.userId

    if (!userId) {
      reply.code(401).send({ error: 'Unauthorized: no user ID' })
      return
    }

    try {
      const result = await deleteChatMedia({
        mediaId,
        userId,
        accessToken: request.user.accessToken,
      })

      if (!result.deleted) {
        reply.code(404).send({ error: 'Media not found' })
        return
      }

      reply.send(result)
    } catch (error) {
      reply.code(500).send({ error: 'Failed to delete media', details: error.message })
    }
  })
}