import Fastify from 'fastify'
import { proxyToMatrix } from './lib/matrix/proxy.js'
import { handleSyncProxy } from './lib/matrix/syncProxy.js'
import { registerMessageRoutes } from './routes/messageRoutes.js'
import { registerAuthRoutes } from './routes/authRoutes.js'

const app = Fastify({ logger: true })

/**
 * Matrix proxy route - forwards all /matrix/* requests to Synapse
 * 
 * This route requires authentication - the request must have `request.user.accessToken`
 * set by the auth middleware (Task 2). 
 * 
 * @param {string} matrixPath - The Matrix/Synapse path (e.g., `_matrix/client/v3/rooms`)
 * @returns {void}
 */
app.route({
  method: ['GET', 'POST', 'PUT', 'DELETE'],
  url: '/matrix/:matrixPath*',
  handler: async (request, reply) => {
    // Auth check - ensure user has access token
    if (!request.user || !request.user.accessToken) {
      reply.code(401).send({ error: 'Unauthorized: no access token' })
      return
    }

    await proxyToMatrix(request, reply, request.params.matrixPath)
  },
})

/**
 * WebSocket proxy for Matrix /sync
 * 
 * Desktop connects to Echo API /matrix/sync WebSocket
 * Echo API proxies to Synapse /sync with user's access_token
 * Bidirectional message piping with reconnection logic
 * 
 * @param {object} request - Fastify request object (expected to have `user.accessToken`)
 * @param {object} reply - Fastify reply object (socket is the WebSocket after upgrade)
 * @returns {void}
 */
app.get('/matrix/sync', { websocket: true }, handleSyncProxy)

/**
 * Google SSO authentication routes
 * These routes do NOT require authentication (no API key needed)
 * - `POST /auth/google` → initiates SSO flow, returns `{ loginUrl, state }`
 * - `GET /auth/callback` → receives Synapse redirect, exchanges code for tokens
 * - `POST /auth/token` → desktop exchanges `code` for tokens
 * - `POST /auth/refresh` → refreshes access token using refresh token
 */
registerAuthRoutes(app)

export default app

/**
 * Register all API routes
 */
registerMessageRoutes(app)