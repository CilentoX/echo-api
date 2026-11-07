import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import { registerGuildRoutes } from '@/routes/guildRoutes.js'
import { guildProfileService } from '@/services/guildProfileService.js'
import { synapseTokenCache } from '@/plugins/auth.js'

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

  describe('Channel management endpoints', () => {
    const testToken = 'valid-test-token'
    beforeEach(() => {
      synapseTokenCache.set(testToken, {
        user: { userId: '@tester:litteris.online', accessToken: testToken },
        expiresAt: Date.now() + 60000,
      })
    })

    it('PATCH /api/channels/:channelId deve atualizar metadados do canal', async () => {
      vi.spyOn(guildProfileService, 'updateChannel').mockResolvedValue({
        channelId: '!chan1:matrix',
        name: 'novo-canal',
        topic: 'Novo tópico',
        category: 'GERAL',
        type: 'text',
      })

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/channels/!chan1:matrix',
        headers: { authorization: `Bearer ${testToken}` },
        body: { name: 'novo-canal', topic: 'Novo tópico' },
      })

      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.name).toBe('novo-canal')
      expect(guildProfileService.updateChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: '!chan1:matrix',
          name: 'novo-canal',
        })
      )
    })

    it('POST /channels/edit (legado) deve suportar atualização de canal', async () => {
      vi.spyOn(guildProfileService, 'updateChannel').mockResolvedValue({
        channelId: '!chan2:matrix',
        name: 'canal-editado',
        topic: 'Tópico',
        category: 'GERAL',
        type: 'text',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/channels/edit',
        headers: { authorization: `Bearer ${testToken}` },
        body: { channelId: '!chan2:matrix', data: { name: 'canal-editado' } },
      })

      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.name).toBe('canal-editado')
    })

    it('DELETE /api/channels/:channelId deve excluir o canal', async () => {
      vi.spyOn(guildProfileService, 'deleteChannel').mockResolvedValue({
        success: true,
        channelId: '!chan1:matrix',
      })

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/channels/!chan1:matrix',
        headers: { authorization: `Bearer ${testToken}` },
      })

      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.success).toBe(true)
      expect(guildProfileService.deleteChannel).toHaveBeenCalledWith(
        expect.objectContaining({ channelId: '!chan1:matrix' })
      )
    })

    it('POST /channels/delete (legado) deve suportar exclusão de canal', async () => {
      vi.spyOn(guildProfileService, 'deleteChannel').mockResolvedValue({
        success: true,
        channelId: '!chan2:matrix',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/channels/delete',
        headers: { authorization: `Bearer ${testToken}` },
        body: { channelId: '!chan2:matrix' },
      })

      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.payload)
      expect(data.success).toBe(true)
    })
  })
})

