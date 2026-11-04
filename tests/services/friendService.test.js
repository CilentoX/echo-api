import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as friendService from '../../src/services/friendService.js'

describe('friendService', () => {
  let mockDb

  beforeEach(() => {
    mockDb = {
      friendship: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      userProfile: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      userToken: {
        findUnique: vi.fn(),
      },
    }
  })

  describe('listFriends', () => {
    it('deve categorizar amizades, solicitações recebidas, enviadas e bloqueados com perfis mesclados', async () => {
      const myId = '@me:litteris.online'
      const friendId = '@friend:litteris.online'
      const pendingInId = '@incoming:litteris.online'
      const pendingOutId = '@outgoing:litteris.online'
      const blockedId = '@blocked:litteris.online'

      mockDb.friendship.findMany.mockResolvedValue([
        {
          id: 'f1',
          requesterId: myId,
          addresseeId: friendId,
          status: 'accepted',
          directRoomId: '!room1:litteris.online',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'f2',
          requesterId: pendingInId,
          addresseeId: myId,
          status: 'pending',
          directRoomId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'f3',
          requesterId: myId,
          addresseeId: pendingOutId,
          status: 'pending',
          directRoomId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'f4',
          requesterId: myId,
          addresseeId: blockedId,
          status: 'blocked',
          blockedById: myId,
          directRoomId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      mockDb.userProfile.findMany.mockResolvedValue([
        {
          userId: friendId,
          nickname: 'amigao',
          avatarUrl: 'mxc://avatar1',
          bio: 'Olá',
        },
        {
          userId: pendingInId,
          nickname: 'novato',
          avatarUrl: null,
          bio: null,
        },
      ])

      const result = await friendService.listFriends(myId, mockDb)

      expect(result.friends).toHaveLength(1)
      expect(result.friends[0].userId).toBe(friendId)
      expect(result.friends[0].nickname).toBe('amigao')
      expect(result.friends[0].directRoomId).toBe('!room1:litteris.online')

      expect(result.pendingIncoming).toHaveLength(1)
      expect(result.pendingIncoming[0].user.userId).toBe(pendingInId)
      expect(result.pendingIncoming[0].user.nickname).toBe('novato')

      expect(result.pendingOutgoing).toHaveLength(1)
      expect(result.pendingOutgoing[0].user.userId).toBe(pendingOutId)
      expect(result.pendingOutgoing[0].user.displayName).toBe('outgoing')

      expect(result.blocked).toHaveLength(1)
      expect(result.blocked[0].user.userId).toBe(blockedId)
    })
  })

  describe('sendFriendRequest', () => {
    it('deve rejeitar adicionar a si mesmo', async () => {
      await expect(
        friendService.sendFriendRequest('@me:litteris.online', '@me:litteris.online', mockDb)
      ).rejects.toThrow('Você não pode adicionar a si mesmo como amigo')
    })

    it('deve criar uma nova solicitação se não houver relacionamento prévio', async () => {
      mockDb.userProfile.findFirst.mockResolvedValue(null)
      mockDb.friendship.findFirst.mockResolvedValue(null)
      mockDb.friendship.create.mockResolvedValue({
        id: 'new_f',
        requesterId: '@me:litteris.online',
        addresseeId: '@target:litteris.online',
        status: 'pending',
      })

      const res = await friendService.sendFriendRequest(
        '@me:litteris.online',
        '@target:litteris.online',
        mockDb
      )

      expect(res.status).toBe('pending')
      expect(mockDb.friendship.create).toHaveBeenCalledWith({
        data: {
          requesterId: '@me:litteris.online',
          addresseeId: '@target:litteris.online',
          status: 'pending',
        },
      })
    })

    it('deve aceitar automaticamente se o destinatário já havia enviado solicitação (auto-accept)', async () => {
      mockDb.friendship.findFirst.mockResolvedValue({
        id: 'existing_f',
        requesterId: '@target:litteris.online',
        addresseeId: '@me:litteris.online',
        status: 'pending',
      })
      mockDb.friendship.update.mockResolvedValue({
        id: 'existing_f',
        status: 'accepted',
      })

      const res = await friendService.sendFriendRequest(
        '@me:litteris.online',
        '@target:litteris.online',
        mockDb
      )

      expect(res.autoAccepted).toBe(true)
      expect(mockDb.friendship.update).toHaveBeenCalledWith({
        where: { id: 'existing_f' },
        data: { status: 'accepted', blockedById: null },
      })
    })

    it('deve falhar se já forem amigos', async () => {
      mockDb.friendship.findFirst.mockResolvedValue({
        id: 'existing_f',
        status: 'accepted',
      })

      await expect(
        friendService.sendFriendRequest('@me:litteris.online', '@target:litteris.online', mockDb)
      ).rejects.toThrow('Vocês já são amigos.')
    })

    it('deve falhar se o usuário estiver bloqueado', async () => {
      mockDb.friendship.findFirst.mockResolvedValue({
        id: 'existing_f',
        status: 'blocked',
        blockedById: '@me:litteris.online',
      })

      await expect(
        friendService.sendFriendRequest('@me:litteris.online', '@target:litteris.online', mockDb)
      ).rejects.toThrow('Você bloqueou este usuário')
    })
  })

  describe('acceptFriendRequest', () => {
    it('deve aceitar solicitação quando o usuário é o destinatário', async () => {
      mockDb.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        requesterId: '@requester:litteris.online',
        addresseeId: '@me:litteris.online',
        status: 'pending',
      })
      mockDb.friendship.update.mockResolvedValue({
        id: 'f1',
        status: 'accepted',
      })

      const res = await friendService.acceptFriendRequest('@me:litteris.online', 'f1', mockDb)
      expect(res.status).toBe('accepted')
    })

    it('deve proibir se quem tenta aceitar não for o destinatário', async () => {
      mockDb.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        requesterId: '@requester:litteris.online',
        addresseeId: '@other:litteris.online',
        status: 'pending',
      })

      await expect(
        friendService.acceptFriendRequest('@me:litteris.online', 'f1', mockDb)
      ).rejects.toThrow('Apenas o destinatário pode aceitar esta solicitação')
    })
  })

  describe('decline, cancel e removeFriend', () => {
    it('declineFriendRequest deve remover o registro da solicitação', async () => {
      mockDb.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        requesterId: '@requester:litteris.online',
        addresseeId: '@me:litteris.online',
        status: 'pending',
      })
      mockDb.friendship.delete.mockResolvedValue({})

      const res = await friendService.declineFriendRequest('@me:litteris.online', 'f1', mockDb)
      expect(res.success).toBe(true)
      expect(mockDb.friendship.delete).toHaveBeenCalledWith({ where: { id: 'f1' } })
    })

    it('cancelFriendRequest deve falhar se não for o solicitante', async () => {
      mockDb.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        requesterId: '@someone_else:litteris.online',
        addresseeId: '@target:litteris.online',
        status: 'pending',
      })

      await expect(
        friendService.cancelFriendRequest('@me:litteris.online', 'f1', mockDb)
      ).rejects.toThrow('Apenas quem enviou a solicitação pode cancelá-la')
    })

    it('removeFriend deve desfazer amizade aceita', async () => {
      mockDb.friendship.findUnique.mockResolvedValue({
        id: 'f1',
        requesterId: '@me:litteris.online',
        addresseeId: '@friend:litteris.online',
        status: 'accepted',
      })
      mockDb.friendship.delete.mockResolvedValue({})

      const res = await friendService.removeFriend('@me:litteris.online', 'f1', mockDb)
      expect(res.success).toBe(true)
    })
  })

  describe('blockUser e unblockUser', () => {
    it('blockUser deve criar ou atualizar para status blocked', async () => {
      mockDb.friendship.findFirst.mockResolvedValue(null)
      mockDb.friendship.create.mockResolvedValue({
        id: 'b1',
        status: 'blocked',
        blockedById: '@me:litteris.online',
      })

      const res = await friendService.blockUser(
        '@me:litteris.online',
        '@chato:litteris.online',
        mockDb
      )
      expect(res.status).toBe('blocked')
    })

    it('unblockUser deve deletar o registro de bloqueio', async () => {
      mockDb.friendship.findFirst.mockResolvedValue({
        id: 'b1',
        status: 'blocked',
        blockedById: '@me:litteris.online',
      })
      mockDb.friendship.delete.mockResolvedValue({})

      const res = await friendService.unblockUser(
        '@me:litteris.online',
        '@chato:litteris.online',
        mockDb
      )
      expect(res.success).toBe(true)
    })
  })

  describe('getOrCreateDirectRoom', () => {
    it('deve retornar a directRoomId existente se já estiver gravada', async () => {
      mockDb.friendship.findFirst.mockResolvedValue({
        id: 'f1',
        directRoomId: '!room123:litteris.online',
      })

      const res = await friendService.getOrCreateDirectRoom(
        '@me:litteris.online',
        '@friend:litteris.online',
        'token123',
        mockDb
      )

      expect(res.roomId).toBe('!room123:litteris.online')
    })
  })

  describe('discoverUsers', () => {
    it('deve listar usuários com status de amizade correto e excluir usuário atual', async () => {
      const myId = '@me:litteris.online'
      const other1 = '@other1:litteris.online'
      const other2 = '@other2:litteris.online'

      mockDb.friendship.findMany.mockResolvedValue([
        { id: 'f1', requesterId: myId, addresseeId: other1, status: 'accepted', directRoomId: '!dm1' },
      ])

      mockDb.userToken.findMany = vi.fn().mockResolvedValue([
        { userId: other1, updatedAt: new Date('2026-11-04T12:00:00Z') },
        { userId: other2, updatedAt: new Date('2026-11-04T11:00:00Z') },
      ])

      mockDb.userProfile.findMany.mockResolvedValue([
        { userId: other1, nickname: 'other_one', avatarUrl: 'http://img1', bio: 'Bio 1' },
      ])

      const res = await friendService.discoverUsers(myId, {}, mockDb)
      expect(res.users).toHaveLength(2)
      expect(res.users[0].userId).toBe(other1)
      expect(res.users[0].status).toBe('friend')
      expect(res.users[0].nickname).toBe('other_one')
      expect(res.users[1].userId).toBe(other2)
      expect(res.users[1].status).toBe('none')
    })
  })
})

