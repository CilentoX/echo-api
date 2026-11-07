import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the tokenStore module
vi.mock('@/lib/auth/tokenStore.js', () => ({
  storeUserTokens: vi.fn(),
}))

// Mock fetch - will be configured per test
global.fetch = vi.fn()

// Mock the encryption module
vi.mock('@/lib/auth/tokenStore.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    encrypt: vi.fn((text) => text),
    decrypt: vi.fn((text) => text),
  }
})

// Mock SYNAPSE_URL
process.env.SYNAPSE_URL = 'http://localhost:8088'

import * as authService from '@/services/authService.js'

describe('authService - initiateGoogleSso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initiateGoogleSso', () => {
    it('should build the Synapse OIDC redirect URL and return loginUrl and state', async () => {
      const result = await authService.initiateGoogleSso('http://localhost:3000/auth/callback')

      expect(result).toHaveProperty('loginUrl')
      expect(result).toHaveProperty('state')

      // loginUrl should contain the Matrix SSO redirect path
      expect(result.loginUrl).toContain('_matrix/client/v3/login/sso/redirect/oidc-google')

      // loginUrl should contain the redirectUrl parameter
      expect(result.loginUrl).toContain('redirectUrl=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback')

      // state should be a non-empty string
      expect(typeof result.state).toBe('string')
      expect(result.state.length).toBeGreaterThan(0)
    })

    it('should generate a state suitable for CSRF protection', async () => {
      const result1 = await authService.initiateGoogleSso('http://localhost:3000/auth/callback')
      const result2 = await authService.initiateGoogleSso('http://localhost:3000/auth/callback')

      // Different calls should generate different states
      expect(result1.state).not.toBe(result2.state)

      // State should be base64-like
      expect(/^[A-Za-z0-9+/_-]+=*$/.test(result1.state)).toBe(true)
    })
  })

  describe('authService - exchangeCodeForTokens', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          device_id: 'DE123456',
          user_id: '@testuser:example.com',
        }),
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should exchange code for tokens via Synapse OIDC callback', async () => {
      const result = await authService.exchangeCodeForTokens('test-code-123', 'test-state')

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('deviceId')
      expect(result).toHaveProperty('userId')

      expect(result.accessToken).toBe('test-access-token')
      expect(result.refreshToken).toBe('test-refresh-token')
      expect(result.deviceId).toBe('DE123456')
      expect(result.userId).toBe('@testuser:example.com')
    })

    it('should throw error when state is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      await expect(authService.exchangeCodeForTokens('test-code-123', null)).rejects.toThrow(
        'Invalid or missing state parameter'
      )
    })

    it('should throw error when code is missing', async () => {
      await expect(authService.exchangeCodeForTokens(null, 'test-state')).rejects.toThrow()
    })
  })

  describe('authService - refreshTokens', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token-999',
          refresh_token: 'new-refresh-token-999',
          expires_in_ms: 300000,
        }),
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should refresh access and refresh token via Synapse refresh endpoint', async () => {
      const result = await authService.refreshTokens('old-refresh-token')

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result.accessToken).toBe('new-access-token-999')
      expect(result.refreshToken).toBe('new-refresh-token-999')
      expect(result.expiresInMs).toBe(300000)
    })

    it('should throw error when refreshToken is missing', async () => {
      await expect(authService.refreshTokens(null)).rejects.toThrow('Invalid or missing refreshToken parameter')
    })

    it('should throw error when Synapse returns an error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Invalid refresh token',
      })

      await expect(authService.refreshTokens('bad-token')).rejects.toThrow('Failed to refresh token: Invalid refresh token')
    })
  })
})