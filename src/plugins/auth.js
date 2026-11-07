import { decrypt } from '../lib/auth/tokenStore.js'
import { jwtVerify, SignJWT } from 'jose'

/**
 * Fastify plugin that sets up the Prisma client decorator.
 * 
 * @param {import('@prisma/client').PrismaClient} client - The Prisma client instance
 * @param {import('fastify').FastifyInstance} app - The Fastify instance
 */
export function setupPrismaClient(app, client) {
  app.decorateRequest('prisma', () => client)
}

/**
 * Gets the JWT verification secret from env.
 * Must be a separate key from TOKEN_ENCRYPTION_KEY.
 * @returns {Uint8Array} The secret key for JWT verification
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set.')
  }
  return Buffer.from(secret, 'base64')
}

/**
 * JWT verification options with issuer and audience validation.
 * @returns {object} Options for jwtVerify
 */
function getJwtVerifyOptions() {
  return {
    issuer: process.env.JWT_ISSUER || 'echo-api',
    audience: process.env.JWT_AUDIENCE || 'echo-client',
  }
}

/**
 * Creates a test JWT for testing purposes.
 * @param {object} payload - JWT payload
 * @returns {Promise<string>} Signed JWT
 */
export async function createTestJwt(payload = {}) {
  const secret = getJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const defaultPayload = {
    sub: 'testuser:example.com',
    iss: getJwtVerifyOptions().issuer,
    aud: getJwtVerifyOptions().audience,
    iat: now,
    exp: now + 3600, // 1 hour
    ...payload,
  }
  return new SignJWT(defaultPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret)
}

/**
 * Resolves a user from the token store by userId.
 * Extracts common logic from both X-API-Key and Bearer branches.
 * 
 * @param {import('@prisma/client').PrismaClient} prisma - The Prisma client instance
 * @param {string} userId - The user identifier (API key or JWT sub)
 * @returns {Promise<object|null>} User token data or null
 */
async function resolveUser(prisma, userId) {
  const userToken = await prisma.userToken.findUnique({
    where: { userId },
  })

  if (!userToken || !userToken.accessToken) {
    return null
  }

  try {
    const accessToken = decrypt(userToken.accessToken)
    const deviceId = userToken.deviceId

    return { userToken, accessToken, deviceId }
  } catch (error) {
    // Decryption failed - invalid key or corrupted data
    return null
  }
}

/**
 * Bounded LRU token cache with TTL expiration.
 * Prevents unbounded memory growth and DoS attacks via brute-force token flooding.
 */
class BoundedTokenCache {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }
    // Refresh LRU order
    this.cache.delete(key)
    this.cache.set(key, item)
    return item
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, value)
  }

  delete(key) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }

  get size() {
    return this.cache.size
  }
}

export const synapseTokenCache = new BoundedTokenCache(5000)

/**
 * Validates a Matrix access token directly against Synapse.
 * @param {string} token - The Matrix access token (e.g. syt_...)
 * @returns {Promise<{ userId: string, accessToken: string, deviceId: string } | null>}
 */
export async function validateSynapseToken(token) {
  if (!token) return null
  const cached = synapseTokenCache.get(token)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user
  }

  const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
  try {
    const res = await fetch(`${synapseUrl}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      synapseTokenCache.delete(token)
      return null
    }
    const data = await res.json()
    if (!data.user_id) return null

    const user = {
      userId: data.user_id,
      accessToken: token,
      deviceId: data.device_id || 'synapse-session',
    }
    // Cache for 60 seconds
    synapseTokenCache.set(token, {
      user,
      expiresAt: Date.now() + 60 * 1000,
    })
    return user
  } catch (err) {
    console.error('[validateSynapseToken] Error validating with Synapse:', err)
    return null
  }
}

/**
 * Extended auth middleware that supports:
 * 1. X-API-Key header (server-side)
 * 2. Authorization: Bearer <jwt | matrix_token> (desktop & web clients)
 *
 * On success, populates request.user with { userId, accessToken, deviceId }
 *
 * @param {object} request - Fastify request object
 * @param {object} reply - Fastify reply object
 * @returns {Promise<void>} Returns 401 if authentication fails, continues if successful
 */
export async function authenticate(request, reply) {
  const apiKey = request.headers['x-api-key']
  const authHeader = request.headers['authorization']

  // 1. Try X-API-Key first (existing authentication method)
  if (apiKey) {
    const prisma = typeof request.prisma === 'function' ? request.prisma() : null
    const userData = prisma ? await resolveUser(prisma, apiKey) : null

    if (!userData) {
      reply.code(401).send({ error: 'Unauthorized: invalid API key' })
      return
    }

    request.user = {
      userId: userData.userToken.userId,
      accessToken: userData.accessToken,
      deviceId: userData.deviceId,
    }
    return
  }

  // 2. Try Authorization: Bearer <token>
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim()

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized: empty bearer token' })
      return
    }

    // A) Synapse Matrix access token (starts with syt_ or syt-)
    if (token.startsWith('syt_') || token.startsWith('syt-')) {
      const user = await validateSynapseToken(token)
      if (user) {
        request.user = user
        return
      }
      reply.code(401).send({ error: 'Unauthorized: invalid or expired matrix token' })
      return
    }

    // B) Try JWT verification with jose
    try {
      const secretKey = getJwtSecret()
      const options = getJwtVerifyOptions()
      const { payload } = await jwtVerify(token, secretKey, options)
      const userId = payload.sub
      const prisma = typeof request.prisma === 'function' ? request.prisma() : null
      const userData = prisma ? await resolveUser(prisma, userId) : null

      if (userData) {
        request.user = {
          userId: userData.userToken.userId,
          accessToken: userData.accessToken,
          deviceId: userData.deviceId,
        }
        return
      }

      request.user = {
        userId,
        accessToken: token,
        deviceId: payload.deviceId || 'jwt-session',
      }
      return
    } catch (error) {
      // If it looks like a JWT (header.payload.signature), return 401 immediately
      if (token.split('.').length === 3) {
        reply.code(401).send({ error: 'Unauthorized: invalid or expired bearer token' })
        return
      }
    }

    // C) Fallback: Check if it's a valid Synapse token even without syt_ prefix
    const user = await validateSynapseToken(token)
    if (user) {
      request.user = user
      return
    }

    reply.code(401).send({ error: 'Unauthorized: invalid bearer token' })
    return
  }

  // No authentication provided
  reply.code(401).send({ error: 'Unauthorized: no authentication credentials' })
}
