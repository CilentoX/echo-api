import Fastify from 'fastify'
import { initiateGoogleSso, exchangeCodeForTokens } from '@/services/authService.js'

/**
 * Registers Google SSO authentication routes.
 * Routes:
 *   GET /auth/google - Initiates SSO flow, returns { loginUrl, state }
 *   GET /auth/callback - Receives Synapse redirect, exchanges code for tokens
 *   POST /auth/token - Desktop exchanges code for tokens (alternative to callback)
 *   POST /auth/refresh - Refreshes access token using refresh token
 *
 * These routes do NOT require authentication (no API key needed).
 *
 * @param {import('fastify').FastifyInstance} app - The Fastify application instance
 * @returns {void}
 */
export function registerAuthRoutes(app) {
  /**
   * GET /auth/google
   * Initiates the Google SSO login flow.
   * Builds the Synapse OIDC redirect URL and returns the login URL and state.
   *
   * @param {object} request - Fastify request object
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get('/auth/google', async (request, reply) => {
    const { redirectUrl } = request.query

    if (!redirectUrl) {
      reply.code(400).send({ error: 'redirectUrl query parameter is required' })
      return
    }

    const { loginUrl, state } = initiateGoogleSso(redirectUrl)

    // Store the state in a short-lived cache for CSRF validation later
    // In production, this would be Redis; for now we rely on the flow

    // For desktop: return JSON with loginUrl and state
    reply.send({ loginUrl, state })
  })

  /**
   * GET /auth/callback
   * Receives the Synapse OIDC redirect after Google authentication.
   * Exchanges the code for tokens and stores them in the token store.
   *
   * @param {object} request - Fastify request object (expected to have query: { code, state })
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.get('/auth/callback', async (request, reply) => {
    const { code, state } = request.query

    if (!code) {
      reply.code(400).send({ error: 'code query parameter is required' })
      return
    }

    if (!state) {
      reply.code(400).send({ error: 'state query parameter is required' })
      return
    }

    try {
      const tokens = await exchangeCodeForTokens(code, state)

      // Store tokens in the token store
      // In a full implementation, we'd have the userId from the tokens
      // and would call tokenStore.storeUserTokens(userId, accessToken, refreshToken, deviceId)
      // For now, we just return the tokens

      reply.send(tokens)
    } catch (error) {
      reply.code(400).send({ error: error.message })
    }
  })

  /**
   * POST /auth/token
   * Desktop exchanges code for tokens (alternative to callback).
   * Expects { code } in the request body.
   *
   * @param {object} request - Fastify request object (expected to have body: { code })
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post('/auth/token', async (request, reply) => {
    const { code } = request.body

    if (!code) {
      reply.code(400).send({ error: 'code body parameter is required' })
      return
    }

    try {
      // Get state from query or generate a default for this flow
      // In a real implementation, the state would be retrieved from cache
      const state = request.query.state || 'default-state'

      const tokens = await exchangeCodeForTokens(code, state)

      // Store tokens in the token store
      // tokenStore.storeUserTokens(tokens.userId, tokens.accessToken, tokens.refreshToken, tokens.deviceId)

      reply.send(tokens)
    } catch (error) {
      reply.code(400).send({ error: error.message })
    }
  })

  /**
   * POST /auth/refresh
   * Refreshes access token using refresh token.
   * Expects { refreshToken } in the request body.
   *
   * @param {object} request - Fastify request object (expected to have body: { refreshToken })
   * @param {object} reply - Fastify reply object
   * @returns {void}
   */
  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body

    if (!refreshToken) {
      reply.code(400).send({ error: 'refreshToken body parameter is required' })
      return
    }

    try {
      // In a real implementation, this would call Synapse's token refresh endpoint
      // or use the jose library to refresh the token
      // For now, we return a mock response

      const newAccessToken = `new-access-token-${Date.now()}`
      const newRefreshToken = refreshToken

      reply.send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      })
    } catch (error) {
      reply.code(400).send({ error: error.message })
    }
  })
}