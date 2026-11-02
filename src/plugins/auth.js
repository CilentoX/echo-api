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
 * Extended auth middleware that supports both:
 * 1. X-API-Key header (existing - for server-side)
 * 2. Authorization: Bearer <jwt> (new - for desktop clients)
 *
 * On success, populates request.user with { userId, accessToken, deviceId }
 * from the encrypted token store.
 *
 * @param {object} request - Fastify request object
 * @param {object} reply - Fastify reply object
 * @returns {Promise<void>} Returns 401 if authentication fails, continues if successful
 */
export async function authenticate(request, reply) {
  // Try X-API-Key first (existing authentication method)
  // Fastify normalizes headers to lowercase
  const apiKey = request.headers['x-api-key']
  const authHeader = request.headers['authorization']

  // Try X-API-Key first (existing authentication method)
  if (apiKey) {
    const prisma = request.prisma()
    const userData = await resolveUser(prisma, apiKey)

    if (!userData) {
      reply.code(401).send({ error: 'Unauthorized: invalid API key' })
      return
    }

    // Populate request.user
    // Per spec: X-API-Key maps to a user record via the token store
    request.user = {
      userId: userData.userToken.userId,
      accessToken: userData.accessToken,
      deviceId: userData.deviceId,
    }
    return
  }

  // Try Authorization: Bearer <jwt> (new method for desktop)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.substring(7)

    // JWT verification with jose library - separate secret from encryption key
    const prisma = request.prisma()
    let userData = null
    let userId = null

    try {
      // Use separate JWT_SECRET for signing/verification (not TOKEN_ENCRYPTION_KEY)
      const secretKey = getJwtSecret()
      const options = getJwtVerifyOptions()
      const { payload } = await jwtVerify(jwt, secretKey, options)
      userId = payload.sub
    } catch (error) {
      // Invalid/expired/tampered JWT - NO fallback, return 401 immediately
      reply.code(401).send({ error: 'Unauthorized: invalid or expired bearer token' })
      return
    }

    userData = await resolveUser(prisma, userId)

    if (!userData) {
      console.error('[AUTH] No user data found for userId:', userId)
      reply.code(401).send({ error: 'Unauthorized: invalid bearer token' })
      return
    }

    // Populate request.user
    // Per spec: JWT should be verified and decoded to extract userId
    request.user = {
      userId: userData.userToken.userId,
      accessToken: userData.accessToken,
      deviceId: userData.deviceId,
    }
    return
  }

  // No authentication provided
  reply.code(401).send({ error: 'Unauthorized: no authentication credentials' })
}