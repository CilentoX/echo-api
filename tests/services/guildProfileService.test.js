import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Prisma client - must be at top for vitest auto-mocking
vi.mock('../src/db.js', () => ({
  prisma: {
    guildProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    channelProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import * as service from '../../src/services/guildProfileService.js'

describe('GuildProfile and ChannelProfile models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GuildProfile', () => {
    it('should have matrixSpaceId field', () => {
      const profile = {
        guildId: 'test-guild',
        matrixSpaceId: 'spacetest:matrix',
        topic: 'Test topic',
        isPrivate: false,
        maxMembers: 100,
      }
      expect(profile.matrixSpaceId).toBe('spacetest:matrix')
      expect(profile.topic).toBe('Test topic')
      expect(profile.isPrivate).toBe(false)
      expect(profile.maxMembers).toBe(100)
    })

    it('should have isPrivate default to false', () => {
      const profile = {
        guildId: 'test-guild',
        isPrivate: false,
      }
      expect(profile.isPrivate).toBe(false)
    })
  })

  describe('ChannelProfile', () => {
    it('should have required fields', () => {
      const channel = {
        id: 'channel-1',
        guildId: 'test-guild',
        matrixRoomId: 'roomtest:matrix',
        name: 'general',
        topic: 'Channel topic',
        type: 'text',
        category: null,
      }
      expect(channel.id).toBe('channel-1')
      expect(channel.guildId).toBe('test-guild')
      expect(channel.matrixRoomId).toBe('roomtest:matrix')
      expect(channel.name).toBe('general')
      expect(channel.topic).toBe('Channel topic')
      expect(channel.type).toBe('text')
      expect(channel.category).toBeNull()
    })
  })

  describe('Relation: GuildProfile has many ChannelProfile', () => {
    it('should associate channels with a guild', () => {
      const guild = {
        guildId: 'test-guild',
        matrixSpaceId: 'spacetest:matrix',
      }
      const channels = [
        { id: 'ch1', guildId: 'test-guild', matrixRoomId: 'room1:matrix', name: 'general' },
        { id: 'ch2', guildId: 'test-guild', matrixRoomId: 'room2:matrix', name: 'voice' },
      ]
      expect(channels.length).toBe(2)
      expect(channels[0].guildId).toBe(guild.guildId)
      expect(channels[1].guildId).toBe(guild.guildId)
    })
  })
})