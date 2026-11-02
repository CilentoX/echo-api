import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { encrypt, decrypt } from '../src/lib/auth/tokenStore.js'

describe('Token Store - Encryption', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'BqMY9SmbfN4+b2UP8JP2+MpIk/HfSseOX3KTw2Nby+E=')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('encrypt', () => {
    it('encrypt/decrypt roundtrip', () => {
      const text = 'hello'
      const encrypted = encrypt(text)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(text)
    })

    it('different ciphertext for same input due to random IV', () => {
      const text = 'same text'
      const encrypted1 = encrypt(text)
      const encrypted2 = encrypt(text)
      expect(encrypted1).not.toBe(encrypted2)
      expect(decrypt(encrypted1)).toBe('same text')
      expect(decrypt(encrypted2)).toBe('same text')
    })
  })
})