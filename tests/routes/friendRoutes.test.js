import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the auth plugin
vi.mock('../../src/plugins/auth.js', () => {
  const authenticate = vi.fn(async (request, reply) => {
    const authHeader = request.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized: no authentication credentials' })
      return
    }
    request.user = {
      userId: '@alice:litteris.online',
      accessToken: 'syt_fake_token',
      deviceId: null,
    }
  })
  Object.defineProperty(authenticate, 'length', { value: 2 })
  return {
    authenticate,
    setupPrismaClient: vi.fn(),
    createTestJwt: async () => 'mock-jwt-token',
  }
})

import Fastify from 'fastify'
import { registerFriendRoutes } from '../../src/routes/friendRoutes.js'
import * as friendService from '../../src/services/friendService.js'

describe('friendRoutes', () => {
  let app
  const authHeaders = { authorization: 'Bearer syt_fake_token' }

  beforeEach(async () => {
    app = Fastify()
    registerFriendRoutes(app)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
  })

  describe('Autenticação e Proteção', () => {
    it('GET /api/friends deve retornar 401 sem autenticação', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/friends',
      })
      expect(res.statusCode).toBe(401)
    })

    it('POST /api/friends/request deve retornar 401 sem autenticação', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/request',
        body: { target: '@amigo:litteris.online' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('POST /api/friends/:id/accept deve retornar 401 sem autenticação', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/f123/accept',
      })
      expect(res.statusCode).toBe(401)
    })

    it('DELETE /api/friends/:id deve retornar 401 sem autenticação', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/friends/f123',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('Handlers de rotas autenticadas', () => {
    it('GET /api/friends deve retornar lista de amizades', async () => {
      const mockData = {
        friends: [{ friendshipId: 'f1', userId: '@bob:litteris.online', displayName: 'Bob' }],
        pendingIncoming: [],
        pendingOutgoing: [],
        blocked: [],
      }
      vi.spyOn(friendService, 'listFriends').mockResolvedValue(mockData)

      const res = await app.inject({
        method: 'GET',
        url: '/api/friends',
        headers: authHeaders,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(mockData)
    })

    it('POST /api/friends/request deve validar payload e criar pedido', async () => {
      vi.spyOn(friendService, 'sendFriendRequest').mockResolvedValue({
        id: 'f2',
        requesterId: '@alice:litteris.online',
        addresseeId: '@bob:litteris.online',
        status: 'pending',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/request',
        headers: authHeaders,
        body: { target: '@bob:litteris.online' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().id).toBe('f2')
    })

    it('POST /api/friends/request deve retornar 400 se campo target estiver vazio', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/request',
        headers: authHeaders,
        body: {},
      })

      expect(res.statusCode).toBe(400)
    })

    it('POST /api/friends/:id/accept deve responder 200 com amizade aceita', async () => {
      vi.spyOn(friendService, 'acceptFriendRequest').mockResolvedValue({
        id: 'f1',
        status: 'accepted',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/f1/accept',
        headers: authHeaders,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('accepted')
    })

    it('DELETE /api/friends/:id deve responder 200 com sucesso', async () => {
      vi.spyOn(friendService, 'removeFriend').mockResolvedValue({
        success: true,
        message: 'Amizade desfeita',
      })

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/friends/f1',
        headers: authHeaders,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })

    it('POST /api/friends/dm deve retornar roomId da conversa direta', async () => {
      vi.spyOn(friendService, 'getOrCreateDirectRoom').mockResolvedValue({
        roomId: '!direct_room_1:litteris.online',
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/dm',
        headers: authHeaders,
        body: { targetUserId: '@bob:litteris.online' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().roomId).toBe('!direct_room_1:litteris.online')
    })

    it('POST /api/friends/dm deve retornar 403 se usuário estiver bloqueado', async () => {
      const err = new Error('Não é possível iniciar conversa com usuário bloqueado')
      err.statusCode = 403
      vi.spyOn(friendService, 'getOrCreateDirectRoom').mockRejectedValue(err)

      const res = await app.inject({
        method: 'POST',
        url: '/api/friends/dm',
        headers: authHeaders,
        body: { targetUserId: '@blocked:litteris.online' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error).toContain('bloqueado')
    })
  })
})
