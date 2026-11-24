import './polyfill.js'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
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
import { registerLinkPreviewRoutes } from './routes/linkPreviewRoutes.js'
import { registerAiRoutes } from './routes/aiRoutes.js'
import { registerWidgetRoutes } from './routes/widgetRoutes.js'
import { setupPrismaClient } from './plugins/auth.js'
import cors from '@fastify/cors'

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
const loggerConfig = isDev
  ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
  : true;
const app = Fastify({
  logger: loggerConfig,
  routerOptions: { ignoreTrailingSlash: true },
})

// Suporte a upload multipart (imagens, avatares, áudio)
await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
})

// Proteção contra brute-force e abuso com rate limiting
await app.register(rateLimit, {
  global: true,
  max: process.env.NODE_ENV === 'test' ? 10000 : 300,
  timeWindow: '1 minute',
  allowList: (req) => {
    const url = req.url || ''
    return (
      url.startsWith('/health') ||
      url.startsWith('/livez') ||
      url.startsWith('/readyz') ||
      url.startsWith('/api/health') ||
      url === '/' ||
      url.startsWith('/matrix/sync') ||
      url.includes('/voice/events')
    )
  },
})

// WebSocket support for /matrix/sync proxy
await app.register(websocket)

// Registrar Prisma client decorator para uso no middleware authenticate
const prisma = new PrismaClient()
await app.register(setupPrismaClient, { client: prisma })

// Cleanup de DMs legado removido — foi migration one-shot, nao precisa rodar em todo boot

// ── CORS ──
// Configuração declarativa via @fastify/cors. Origens permitidas via env CORS_ORIGIN.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:1420,https://echo-api.litteris.online')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

await app.register(cors, {
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-matrix-auth', 'X-Requested-With', 'Range'],
  credentials: true,
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

 // Verificar Synapse
 let synapseStatus = "unknown"
 try {
 const synapseUrl = process.env.SYNAPSE_URL || "https://echo.litteris.online"
 const synapseRes = await fetch(`${synapseUrl}/_matrix/client/v3/versions`, { signal: AbortSignal.timeout(3000) })
 synapseStatus = synapseRes.ok ? "ok" : "degraded"
 } catch {
 synapseStatus = "unreachable"
 }

  const payload = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      synapse: synapseStatus,
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
 * WebSocket proxy for Matrix /sync
 * MUST be registered BEFORE the /matrix/* wildcard route so Fastify
 * matches this exact path first instead of falling through to the wildcard.
 */
app.get('/matrix/sync', { websocket: true }, handleSyncProxy)

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
 * Google SSO authentication routes
 * These routes do NOT require authentication (no API key needed)
 */
// Auth routes com rate limit especifico (20/min)
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
registerLinkPreviewRoutes(app)
registerAiRoutes(app)
registerWidgetRoutes(app)

export default app
