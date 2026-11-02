import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the matrix client methods - must be at top
vi.mock('@/lib/matrix/client.js', () => ({
  getMatrixClient: vi.fn(),
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

// Mock auth plugin - must be at top
vi.mock('@/plugins/auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createTestJwt: async (payload = {}) => {
      const { jwtVerify, SignJWT } = await import('jose')
      const jwtSecret = 'test-secret-key-base64-minimal'
      const secret = new TextEncoder().encode(jwtSecret)
      const now = Math.floor(Date.now() / 1000)
      const defaultPayload = {
        sub: '@testuser:example.com',
        iss: 'echo-api',
        aud: 'echo-client',
        iat: now,
        exp: now + 3600,
        ...payload,
      }
      return new SignJWT(defaultPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .sign(secret)
  },
  }
})

vi.resetModules()

import Fastify from 'fastify'
import * as auth from '@/plugins/auth.js'
import { registerRealtimeRoutes } from '@/routes/realtimeRoutes.js'

describe('realtimeRoutes', () => {
  let app

  beforeEach(async () => {
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
      const jwt = await auth.createTestJwt({
        sub: '@testuser:example.com',
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/typing',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        body: {},
      })

      expect(response.statusCode).toBe(400)
    })

    it('should send typing indicator when authenticated', async () => {
      const jwt = await auth.createTestJwt({
        sub: '@testuser:example.com',
      })

      const mockClient = {
        sendTyping: vi.fn().mockResolvedValue({}),
      }
      import('@/lib/matrix/client.js').then((mod) => {
        mod.getMatrixClient.mockResolvedValue(mockClient)
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/typing',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        body: { typing: true, timeout: 30000 },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
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
      const jwt = await auth.createTestJwt({
        sub: '@testuser:example.com',
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/receipt',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        body: { receiptType: 'm.read' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should send read receipt when authenticated', async () => {
      const jwt = await auth.createTestJwt({
        sub: '@testuser:example.com',
      })

      const mockClient = {
        sendReadReceipt: vi.fn().mockResolvedValue({}),
      }
      import('@/lib/matrix/client.js').then((mod) => {
        mod.getMatrixClient.mockResolvedValue(mockClient)
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/api/rooms/testroom:example.com/receipt',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        body: { eventId: '$event1:example.com', receiptType: 'm.read' },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
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
      const jwt = await auth.createTestJwt({
        sub: '@testuser:example.com',
      })

      const mockClient = {
        getPresence: vi.fn().mockResolvedValue({ presence: 'online' }),
      }
      import('@/lib/matrix/client.js').then((mod) => {
        mod.getMatrixClient.mockResolvedValue(mockClient)
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/@testuser:example.com/presence',
        headers: {
          authorization: `Bearer ${jwt}`,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.presence).toBe('online')
    })
  })
})