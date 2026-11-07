import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the auth service module - must be at top
vi.mock('@/services/authService.js', () => ({
  initiateGoogleSso: vi.fn((redirectUrl) => {
    return {
      loginUrl: 'http://localhost:8088/_matrix/client/v3/login/sso/redirect/oidc-google?redirectUrl=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback',
      state: 'base64state123',
    }
  }),
  exchangeCodeForTokens: vi.fn((code, state) => {
    return {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      deviceId: 'DE123456',
      userId: '@testuser:example.com',
    }
  }),
  refreshTokens: vi.fn((refreshToken) => {
    if (refreshToken === 'invalid-refresh-token') {
      throw new Error('Invalid refresh token')
    }
    return {
      accessToken: 'refreshed-access-token',
      refreshToken: 'refreshed-refresh-token',
    }
  }),
}))

import Fastify from 'fastify'
import * as authService from '@/services/authService.js'
import { registerAuthRoutes } from '@/routes/authRoutes.js'

describe('authRoutes - Google SSO login endpoint', () => {
  let app

  beforeEach(async () => {
    app = Fastify()
    await registerAuthRoutes(app)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /auth/google', () => {
    it('should return 400 when redirectUrl is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'redirectUrl query parameter is required' })
    })

    it('should return { loginUrl, state } when redirectUrl is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/google',
        query: {
          redirectUrl: 'http://localhost:3000/auth/callback',
        },
      })

      console.log('Response status:', response.statusCode)
      console.log('Response body:', response.json())
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('loginUrl')
      expect(body).toHaveProperty('state')
      expect(body.loginUrl).toContain('_matrix/client/v3/login/sso/redirect/oidc-google')
    })
  })

  describe('GET /auth/callback', () => {
    it('should return 400 when code is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          state: 'test-state',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'code query parameter is required' })
    })

    it('should return 400 when state is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'test-code',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'state query parameter is required' })
    })

    it('should exchange code for tokens and return them when code and state are provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'test-code-123',
          state: 'test-state',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('accessToken')
      expect(response.json()).toHaveProperty('refreshToken')
      expect(response.json()).toHaveProperty('deviceId')
      expect(response.json()).toHaveProperty('userId')
    })

    it('should return 400 with error when exchange fails', async () => {
      // Mock exchangeCodeForTokens to throw
      vi.mocked(authService.exchangeCodeForTokens).mockRejectedValueOnce(new Error('Invalid code'))

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'invalid-code',
          state: 'test-state',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'Invalid code' })
    })
  })

  describe('POST /auth/token', () => {
    it('should return 400 when code is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        body: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'code body parameter is required' })
    })

    it('should exchange code for tokens when code is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        body: {
          code: 'test-code-123',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('accessToken')
      expect(response.json()).toHaveProperty('refreshToken')
      expect(response.json()).toHaveProperty('deviceId')
      expect(response.json()).toHaveProperty('userId')
    })

    it('should return 400 with error when exchange fails', async () => {
      // Mock exchangeCodeForTokens to throw
      vi.mocked(authService.exchangeCodeForTokens).mockRejectedValueOnce(new Error('Invalid code'))

      const response = await app.inject({
        method: 'POST',
        url: '/auth/token',
        body: {
          code: 'invalid-code',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'Invalid code' })
    })
  })

  describe('POST /auth/refresh', () => {
    it('should return 400 when refreshToken is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        body: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'refreshToken body parameter is required' })
    })

    it('should refresh access token when refreshToken is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        body: {
          refreshToken: 'test-refresh-token',
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('accessToken')
      expect(response.json()).toHaveProperty('refreshToken')
    })

    it('should return 400 with error when refresh fails', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValueOnce(new Error('Invalid refresh token'))

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        body: {
          refreshToken: 'invalid-refresh-token',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: 'Invalid refresh token' })
    })
  })
})