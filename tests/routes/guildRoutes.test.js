import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { registerGuildRoutes } from '@/routes/guildRoutes.js'
import { guildProfileService } from '@/services/guildProfileService.js'

describe('guildRoutes', () => {
  let app

  beforeEach(async () => {
    app = Fastify()
    registerGuildRoutes(app)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('Authentication protection', () => {
    it('GET /guilds should return 401 without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/guilds',
      })
      expect(res.statusCode).toBe(401)
    })

    it('GET /api/guilds should return 401 without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/guilds',
      })
      expect(res.statusCode).toBe(401)
    })

    it('POST /guilds should return 401 without token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/guilds',
        body: { name: 'Minha Guilda' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('GET /channels without token should return 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/channels?guildId=test',
      })
      expect(res.statusCode).toBe(401)
    })

    it('POST /invites/abc/join without token should return 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/invites/abc/join',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('Invites preview (public)', () => {
    it('GET /invites/:code returns 404 if not found', async () => {
      vi.spyOn(guildProfileService, 'getInvitePreview').mockResolvedValue({
        error: 'Convite não encontrado ou inválido',
        status: 404,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/invites/nonexistent',
      })
      expect(res.statusCode).toBe(404)
      const data = JSON.parse(res.payload)
      expect(data.error).toContain('não encontrado')
    })

    it('GET /api/invites/:code returns preview when valid', async () => {
      vi.spyOn(guildProfileService, 'getInvitePreview').mockResolvedValue({
        code: 'valid123',
        guildId: '!space:matrix',
        name: 'Echo Community',
        description: 'Servidor Oficial',
        avatarUrl: null,
        bannerUrl: null,
        channelsCount: 3,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/invites/valid123',
      })
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.name).toBe('Echo Community')
      expect(data.guildId).toBe('!space:matrix')
    })
  })
})
