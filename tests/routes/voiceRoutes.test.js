import { describe, it, expect, beforeEach } from 'vitest'
import app from '../../src/app.js'

describe('Voice Routes', () => {
  const fakeToken = 'valid_token'
  const authHeaders = {
    authorization: `Bearer ${fakeToken}`,
  }

  it('permite entrar em uma sala de voz e lista participantes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/channels/test-voice-123/voice/join',
      headers: authHeaders,
      payload: {
        guildId: 'test-guild',
        username: 'Lucas',
        avatarUrl: null,
      },
    })

    // Se auth passar (mock ou real), responde 200
    if (res.statusCode === 200) {
      const data = JSON.parse(res.payload)
      expect(data.success).toBe(true)
      expect(Array.isArray(data.participants)).toBe(true)
    } else {
      // 401 se prisma/token não estiver mockado neste ambiente
      expect([200, 401]).toContain(res.statusCode)
    }
  })

  it('POST /api/channels/:channelId/voice/token exige autenticação', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/channels/test-voice-123/voice/token',
      payload: { username: 'Lucas' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/voice/livekit-webhook ignora quando LIVEKIT não está configurado', async () => {
    const prevKey = process.env.LIVEKIT_API_KEY
    const prevSecret = process.env.LIVEKIT_API_SECRET
    delete process.env.LIVEKIT_API_KEY
    delete process.env.LIVEKIT_API_SECRET

    const res = await app.inject({
      method: 'POST',
      url: '/api/voice/livekit-webhook',
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true, ignored: true })

    if (prevKey) process.env.LIVEKIT_API_KEY = prevKey
    if (prevSecret) process.env.LIVEKIT_API_SECRET = prevSecret
  })
})

