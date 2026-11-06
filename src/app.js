import './polyfill.js'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { PrismaClient } from '@prisma/client'
import { proxyToMatrix } from './lib/matrix/proxy.js'
import { handleSyncProxy } from './lib/matrix/syncProxy.js'
import { registerAuthRoutes } from './routes/authRoutes.js'
import { registerMessageRoutes } from './routes/messageRoutes.js'
import { registerUserProfileRoutes } from './routes/userProfileRoutes.js'
import { registerGuildRoutes } from './routes/guildRoutes.js'
import { guildProfileRoutes } from './routes/guildProfileRoutes.js'
import { registerMemberRoutes } from './routes/memberRoutes.js'
import { registerChatMediaRoutes } from './routes/chatMediaRoutes.js'
import { uploadRoutes } from './routes/uploadRoutes.js'
import { registerRealtimeRoutes } from './routes/realtimeRoutes.js'
import { registerFriendRoutes } from './routes/friendRoutes.js'
import { registerVoiceRoutes } from './routes/voiceRoutes.js'
import { setupPrismaClient } from './plugins/auth.js'

const app = Fastify({ logger: true, ignoreTrailingSlash: true })

// Suporte a upload multipart (imagens, avatares, áudio)
await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
})

// Registrar Prisma client decorator para uso no middleware authenticate
const prisma = new PrismaClient()
await app.register(setupPrismaClient, { client: prisma })

// Limpeza defensiva de IDs fictícios legados de DM (!dm_...) no banco
if (prisma?.friendship && typeof prisma.friendship.updateMany === 'function') {
  prisma.friendship.updateMany({
    where: { directRoomId: { startsWith: '!dm_' } },
    data: { directRoomId: null },
  }).catch(() => {})
}

// ── CORS ──
// Permite chamadas do app desktop (dev: http://localhost:1420) e de outros
// clientes. Em produção, restringir a origens específicas via env CORS_ORIGIN.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:1420,https://echo-api.litteris.online')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

function getCorsOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return allowedOrigins[0]
  // Permitir se origin está na lista ou se é wildcard
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return origin
  }
  return allowedOrigins[0]
}

// Responder OPTIONS (preflight) antes de qualquer handler de rota
app.addHook('onRequest', async (request, reply) => {
  if (request.method === 'OPTIONS') {
    const corsOrigin = getCorsOrigin(request)
    reply
      .header('Access-Control-Allow-Origin', corsOrigin)
      .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, x-matrix-auth, X-Requested-With, Range')
      .header('Access-Control-Allow-Credentials', 'true')
      .code(204)
      .send()
  }
})

// Adicionar headers CORS em todas as respostas
app.addHook('onResponse', (request, reply) => {
  const corsOrigin = getCorsOrigin(request)
  reply.header('Access-Control-Allow-Origin', corsOrigin)
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD')
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, x-matrix-auth, X-Requested-With, Range')
  reply.header('Access-Control-Allow-Credentials', 'true')
})

// Health check routes (Coolify, Docker, Traefik, Kubernetes)
const handleHealth = async (request, reply) => {
  let dbStatus = 'ok'
  try {
    if (prisma && typeof prisma.$queryRaw === 'function') {
      await prisma.$queryRaw`SELECT 1`
      dbStatus = 'connected'
    }
  } catch (err) {
    dbStatus = 'disconnected'
  }

  const payload = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
    },
    version: '1.0.0',
    service: 'echo-api',
  }

  return reply
    .code(200)
    .header('Cache-Control', 'no-cache, no-store, must-revalidate')
    .send(payload)
}

app.route({
  method: ['GET', 'HEAD'],
  url: '/health',
  handler: handleHealth,
})

app.route({
  method: ['GET', 'HEAD'],
  url: '/api/health',
  handler: handleHealth,
})

app.route({
  method: ['GET', 'HEAD'],
  url: '/healthz',
  handler: handleHealth,
})

app.route({
  method: ['GET', 'HEAD'],
  url: '/readyz',
  handler: handleHealth,
})

app.route({
  method: ['GET', 'HEAD'],
  url: '/livez',
  handler: handleHealth,
})

app.route({
  method: ['GET', 'HEAD'],
  url: '/',
  handler: async (request, reply) => {
    return reply.code(200).send({
      message: 'Echo API',
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    })
  },
})

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
  url: '/matrix/*',
  handler: async (request, reply) => {
    if (!request.user || !request.user.accessToken) {
      reply.code(401).send({ error: 'Unauthorized: no access token' })
      return
    }

    const matrixPath = request.params['*'] || ''
    await proxyToMatrix(request, reply, matrixPath)
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
registerGuildRoutes(app)
app.register(guildProfileRoutes, { prefix: '/api/guilds' })
registerMemberRoutes(app)
registerChatMediaRoutes(app)
app.register(uploadRoutes, { prefix: '/api/upload' })
app.register(uploadRoutes, { prefix: '/api/uploads' })
registerRealtimeRoutes(app)
registerFriendRoutes(app)
registerVoiceRoutes(app)

export default app
