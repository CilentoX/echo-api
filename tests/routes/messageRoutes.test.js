import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'

// Mock the auth plugin
vi.mock('../../src/plugins/auth.js', () => {
  const authenticate = vi.fn(async (request, reply) => {
    const authHeader = request.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized: no authentication credentials' })
      return
    }
    request.user = {
      userId: '@alice:litteris.online',
      accessToken: 'syt_fake_token',
      deviceId: null,
    }
  })
  Object.defineProperty(authenticate, 'length', { value: 2 })
  return {
    authenticate,
    setupPrismaClient: vi.fn(),
    createTestJwt: async () => 'mock-jwt-token',
  }
})

// Mock messageService
vi.mock('../../src/services/messageService.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({ eventId: '$msg1', timestamp: 12345 }),
  editMessage: vi.fn().mockResolvedValue({ eventId: '$msg1' }),
  redactMessage: vi.fn().mockResolvedValue({ eventId: '$msg1' }),
  reactToMessage: vi.fn().mockResolvedValue({ eventId: '$msg1' }),
  getOlderMessages: vi.fn().mockResolvedValue([
    {
      eventId: '$msg1',
      roomId: '!r1:hs',
      sender: '@alice:litteris.online',
      body: 'Hello',
      originServerTs: 1000,
    },
  ]),
}))

import { registerMessageRoutes } from '../../src/routes/messageRoutes.js'
import * as messageService from '../../src/services/messageService.js'

describe('messageRoutes', () => {
  let app
  const authHeaders = { authorization: 'Bearer syt_fake_token' }

  beforeEach(async () => {
    app = Fastify()
    registerMessageRoutes(app)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
  })

  describe('GET /api/rooms/:roomId/messages/older', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/rooms/!r1:hs/messages/older?limit=20',
      })
      expect(res.statusCode).toBe(401)
    })

    it('deve retornar 200 e lista de mensagens quando autenticado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/rooms/!r1:hs/messages/older?limit=25',
        headers: authHeaders,
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(Array.isArray(data)).toBe(true)
      expect(data).toHaveLength(1)
      expect(data[0].body).toBe('Hello')
      expect(messageService.getOlderMessages).toHaveBeenCalledWith('!r1:hs', expect.objectContaining({
        limit: 25,
        accessToken: 'syt_fake_token',
        userId: '@alice:litteris.online',
      }))
    })

    it('deve funcionar na rota alternativa /rooms/:roomId/messages/older', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/rooms/!r1:hs/messages/older?limit=20',
        headers: authHeaders,
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(Array.isArray(data)).toBe(true)
    })
  })
})
