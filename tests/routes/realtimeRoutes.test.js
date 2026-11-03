import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { mockMatrixClient } = vi.hoisted(() => ({
  mockMatrixClient: {
    sendTyping: vi.fn().mockResolvedValue({}),
    sendReadReceipt: vi.fn().mockResolvedValue({}),
    getPresence: vi.fn().mockResolvedValue({ presence: 'online' }),
  },
}))

// Mock the matrix client module - always returns a functional mock client
vi.mock('@/lib/matrix/client.js', () => ({
  getMatrixClient: vi.fn().mockResolvedValue(mockMatrixClient),
}))

// Mock the matrix-js-sdk client methods
vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    MatrixClient: actual.MatrixClient.extend({
      sendTyping: vi.fn(),
      sendReadReceipt: vi.fn(),
      getPresence: vi.fn(),
    }),
  }
})

// Mock db.js
vi.mock('@/db.js', () => ({
  prisma: {
    userToken: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}))

// Mock tokenStore so decrypt works
vi.mock('@/lib/auth/tokenStore.js', () => ({
  decrypt: vi.fn().mockReturnValue('real-access-token'),
  encrypt: vi.fn().mockReturnValue('iv|ciphertext|tag'),
  getEncryptionKey: vi.fn().mockReturnValue(Buffer.alloc(32)),
}))

// Mock the auth plugin - authenticate has length 2 so Fastify does NOT pass 'next'
// When authenticate completes, Fastify continues to the route handler automatically
vi.mock('../../src/plugins/auth.js', () => {
  const authenticate = vi.fn(async (request, reply) => {
    const authHeader = request.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized: no authentication credentials' })
      return
    }
    request.user = {
      userId: '@testuser:example.com',
      accessToken: 'real-access-token',
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

import { getMatrixClient } from '@/lib/matrix/client.js'
import Fastify from 'fastify'
import { registerRealtimeRoutes } from '@/routes/realtimeRoutes.js'

describe('realtimeRoutes', () => {
  let app

  beforeEach(async () => {
    vi.clearAllMocks()

    app = Fastify()
    await registerRealtimeRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('PUT /api/rooms/:roomId/typing', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/typing',
        body: { typing: true },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 400 for missing typing field', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/typing',
        headers: {
          authorization: `Bearer mock-jwt-token`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(400)
    })

    it('should send typing indicator when authenticated', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/typing',
        headers: {
          authorization: `Bearer mock-jwt-token`,
        },
        body: { typing: true, timeout: 30000 },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(mockMatrixClient.sendTyping).toHaveBeenCalledWith(
        'testroom:example.com',
        true,
        30000,
      )
    })
  })

  describe('PUT /api/rooms/:roomId/receipt', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/receipt',
        body: { eventId: '$event1:example.com' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 400 for missing eventId', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/receipt',
        headers: {
          authorization: `Bearer mock-jwt-token`,
        },
        body: { receiptType: 'm.read' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should send read receipt when authenticated', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/receipt',
        headers: {
          authorization: `Bearer mock-jwt-token`,
        },
        body: { eventId: '$event1:example.com', receiptType: 'm.read' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(mockMatrixClient.sendReadReceipt).toHaveBeenCalledWith(
        'testroom:example.com',
        '$event1:example.com',
        'm.read',
      )
    })
  })

  describe('GET /api/users/:userId/presence', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/@testuser:example.com/presence',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return presence when authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/@testuser:example.com/presence',
        headers: {
          authorization: `Bearer mock-jwt-token`,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.presence).toBe('online')
      expect(mockMatrixClient.getPresence).toHaveBeenCalledWith('@testuser:example.com')
    })
  })
})
