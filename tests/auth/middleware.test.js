import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import Fastify from 'fastify'
import { encrypt } from '../src/lib/auth/tokenStore.js'
import { setupPrismaClient, authenticate, createTestJwt, synapseTokenCache } from '../src/plugins/auth.js'

// Use a valid base64-encoded 32-byte key for tests (openssl rand -base64 32)
const TEST_ENCRYPTION_KEY = 'BqMY9SmbfN4+b2UP8JP2+MpIk/HfSseOX3KTw2Nby+E='
const TEST_JWT_SECRET = 'Yk1ZTlNiYkY0K2IyVVA4SlAyK01wSWsvSGZTc2VPRFgzS1R3Mk5ieUU9'

let testAccessToken = ''
let testJwt = ''

beforeAll(() => {
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
  vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET)
  vi.stubEnv('JWT_ISSUER', 'echo-api')
  vi.stubEnv('JWT_AUDIENCE', 'echo-client')
  testAccessToken = encrypt('test-access-token')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('Auth Middleware - X-API-Key', () => {
  let app
  const testApiKey = 'test-api-key-user123'

  beforeEach(async () => {
    app = Fastify({ logger: false })
    setupPrismaClient(app, {
      userToken: {
        findUnique: async (params) => {
          const where = params?.where
          if (where?.userId === testApiKey) {
            return {
              userId: testApiKey,
              accessToken: testAccessToken,
              deviceId: 'test-device-001',
            }
          }
          return null
        },
      },
      $disconnect: async () => {},
      $transaction: async (fn) => fn(),
      $use: () => {},
    })
    app.post('/test', async (request, reply) => {
      await authenticate(request, reply)
      return { user: request.user }
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('should authenticate with valid X-API-Key and populate request.user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'x-api-key': testApiKey,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user).toBeDefined()
    expect(body.user.userId).toBe(testApiKey)
    expect(typeof body.user.accessToken).toBe('string')
    expect(body.user.deviceId).toBeDefined()
  })

  it('should return 401 when X-API-Key is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toContain('Unauthorized')
  })

  it('should return 401 when X-API-Key is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        'x-api-key': 'invalid-key',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toContain('Unauthorized')
  })
})

describe('Auth Middleware - Bearer Token', () => {
  let app
  const testUserId = 'testuser:example.com'
  let testJwt = ''

  beforeEach(async () => {
    // Create a valid JWT for testing
    testJwt = await createTestJwt({ sub: testUserId })

    app = Fastify({ logger: false })
    setupPrismaClient(app, {
      userToken: {
        findUnique: async (params) => {
          const where = params?.where
          if (where?.userId === testUserId) {
            return {
              userId: testUserId,
              accessToken: testAccessToken,
              deviceId: 'test-device-002',
            }
          }
          return null
        },
      },
      $disconnect: async () => {},
      $transaction: async (fn) => fn(),
      $use: () => {},
    })
    app.post('/test', async (request, reply) => {
      await authenticate(request, reply)
      return { user: request.user }
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('should authenticate with valid Bearer token (real JWT) and populate request.user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        authorization: `Bearer ${testJwt}`,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user).toBeDefined()
    expect(body.user.userId).toBe(testUserId)
    expect(typeof body.user.accessToken).toBe('string')
    expect(body.user.deviceId).toBeDefined()
  })

  it('should return 401 for expired JWT', async () => {
    const expiredJwt = await createTestJwt({ 
      sub: testUserId, 
      exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    })
    
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        authorization: `Bearer ${expiredJwt}`,
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toContain('Unauthorized')
  })

  it('should return 401 for tampered JWT', async () => {
    const tamperedJwt = testJwt.slice(0, -10) + 'tampered!!'
    
    const response = await app.inject({
      method: 'POST',
      url: '/test',
      headers: {
        authorization: `Bearer ${tamperedJwt}`,
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toContain('Unauthorized')
  })

  it('should return 401 when Authorization header is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toContain('Unauthorized')
  })
})

describe('synapseTokenCache (LRU Bounded Cache)', () => {
  beforeEach(() => {
    synapseTokenCache.clear()
  })

  it('stores and retrieves cached tokens within TTL', () => {
    synapseTokenCache.set('token-1', { user: { userId: 'alice' }, expiresAt: Date.now() + 5000 })
    const cached = synapseTokenCache.get('token-1')
    expect(cached).toEqual({ user: { userId: 'alice' }, expiresAt: expect.any(Number) })
  })

  it('evicts expired tokens automatically', () => {
    synapseTokenCache.set('token-exp', { user: { userId: 'bob' }, expiresAt: Date.now() - 100 })
    const cached = synapseTokenCache.get('token-exp')
    expect(cached).toBeNull()
    expect(synapseTokenCache.size).toBe(0)
  })

  it('enforces maximum capacity and evicts oldest entry', () => {
    const originalMax = synapseTokenCache.maxSize
    synapseTokenCache.maxSize = 2
    try {
      synapseTokenCache.set('t1', { user: { userId: 'u1' }, expiresAt: Date.now() + 10000 })
      synapseTokenCache.set('t2', { user: { userId: 'u2' }, expiresAt: Date.now() + 10000 })
      // Adding a 3rd should evict t1
      synapseTokenCache.set('t3', { user: { userId: 'u3' }, expiresAt: Date.now() + 10000 })
      expect(synapseTokenCache.size).toBe(2)
      expect(synapseTokenCache.get('t1')).toBeNull()
      expect(synapseTokenCache.get('t2')).not.toBeNull()
      expect(synapseTokenCache.get('t3')).not.toBeNull()
    } finally {
      synapseTokenCache.maxSize = originalMax
    }
  })
})
