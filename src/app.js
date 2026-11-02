import Fastify from 'fastify'
import { proxyToMatrix } from './lib/matrix/proxy.js'
import { handleSyncProxy } from './lib/matrix/syncProxy.js'
import { registerAuthRoutes } from './routes/authRoutes.js'
import { registerMessageRoutes } from './routes/messageRoutes.js'
import { registerUserProfileRoutes } from './routes/userProfileRoutes.js'
import { guildProfileRoutes } from './routes/guildProfileRoutes.js'
import { registerMemberRoutes } from './routes/memberRoutes.js'
import { registerChatMediaRoutes } from './routes/chatMediaRoutes.js'
import { uploadRoutes } from './routes/uploadRoutes.js'
import { registerRealtimeRoutes } from './routes/realtimeRoutes.js'

const app = Fastify({ logger: true })

/**
 * Matrix proxy route - forwards all /matrix/* requests to Synapse
 *
 * This route requires authentication - the request must have `request.user.accessToken`
 * set by the auth middleware.
 *
 * @param {string} matrixPath - The Matrix/Synapse path (e.g., `_matrix/client/v3/rooms`)
 * @returns {void}
 */
app.route({
  method: ['GET', 'POST', 'PUT', 'DELETE'],
  url: '/matrix/:matrixPath*',
  handler: async (request, reply) => {
    if (!request.user || !request.user.accessToken) {
      reply.code(401).send({ error: 'Unauthorized: no access token' })
      return
    }

    await proxyToMatrix(request, reply, request.params.matrixPath)
  },
})

/**
 * WebSocket proxy for Matrix /sync
 */
app.get('/matrix/sync', { websocket: true }, handleSyncProxy)

/**
 * Google SSO authentication routes
 * These routes do NOT require authentication (no API key needed)
 */
registerAuthRoutes(app)

/**
 * Register all API routes
 */
registerMessageRoutes(app)
registerUserProfileRoutes(app)
app.register(guildProfileRoutes, { prefix: '/api/guilds' })
registerMemberRoutes(app)
registerChatMediaRoutes(app)
app.register(uploadRoutes, { prefix: '/api' })
registerRealtimeRoutes(app)

export default app