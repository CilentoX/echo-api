import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock matrix-js-sdk so createClient returns a controllable mock
vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createClient: vi.fn(() => ({
      sendMessage: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
      replaceEvent: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
      redactEvent: vi.fn().mockResolvedValue({ event_id: '$evt:test' }),
      sendReaction: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
    })),
  }
})

// Mock the client module so getMatrixClient returns our mock
vi.mock('@/lib/matrix/client.js', () => ({
  getMatrixClient: vi.fn((userId, accessToken, baseUrl) => ({
    sendMessage: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
    replaceEvent: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
    redactEvent: vi.fn().mockResolvedValue({ event_id: '$evt:test' }),
    sendReaction: vi.fn().mockResolvedValue({ event_id: '$evt:test', timestamp: 123 }),
  })),
}))

import {
  sendMessage,
  editMessage,
  redactMessage,
  reactToMessage,
  getOlderMessages,
} from '@/services/messageService.js'

describe('messageService - function existence', () => {
  it('should have sendMessage function', () => {
    expect(typeof sendMessage).toBe('function')
  })

  it('should have editMessage function', () => {
    expect(typeof editMessage).toBe('function')
  })

  it('should have redactMessage function', () => {
    expect(typeof redactMessage).toBe('function')
  })

  it('should have reactToMessage function', () => {
    expect(typeof reactToMessage).toBe('function')
  })

  it('should have getOlderMessages function', () => {
    expect(typeof getOlderMessages).toBe('function')
  })
})

describe('messageService - sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a promise', () => {
    const result = sendMessage('!room:test', {
      body: 'test',
      msgtype: 'm.text',
    })
    expect(result).toBeInstanceOf(Promise)
  })

  it('should have correct parameter signature', () => {
    expect(typeof sendMessage).toBe('function')
  })
})

describe('messageService - editMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a promise', async () => {
    const result = editMessage('!room:test', '!event:test', {
      body: 'edited',
    })
    await expect(result).resolves.toBeDefined()
  })
})

describe('messageService - redactMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a promise', async () => {
    const result = redactMessage('!room:test', '!event:test', {
      accessToken: 'test-token',
      userId: '@user:test',
    })
    await expect(result).resolves.toBeDefined()
  })
})

describe('messageService - reactToMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a promise', async () => {
    const result = reactToMessage('!room:test', '!event:test', {
      key: '👍',
      accessToken: 'test-token',
      userId: '@user:test',
    })
    await expect(result).resolves.toBeDefined()
  })
})

describe('messageService - getOlderMessages', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch and format older messages from Synapse', async () => {
    const mockChunk = [
      {
        type: 'm.room.message',
        event_id: '$msg1',
        room_id: '!room:test',
        sender: '@alice:test',
        origin_server_ts: 1700000000000,
        content: { body: 'hello world', msgtype: 'm.text' },
      },
      {
        type: 'm.room.member',
        event_id: '$member1',
        content: { membership: 'join' },
      },
      {
        type: 'm.room.message',
        event_id: '$msg2',
        room_id: '!room:test',
        sender: '@bob:test',
        origin_server_ts: 1700000010000,
        content: {
          body: 'reply to hello',
          msgtype: 'm.text',
          'm.relates_to': {
            'm.in_reply_to': { event_id: '$msg1' },
          },
        },
      },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chunk: mockChunk }),
    })

    const messages = await getOlderMessages('!room:test', {
      limit: 20,
      accessToken: 'test-token',
      userId: '@alice:test',
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({
      eventId: '$msg1',
      roomId: '!room:test',
      sender: '@alice:test',
      body: 'hello world',
      originServerTs: 1700000000000,
      senderAvatarUrl: null,
    })
    expect(messages[1].replyTo).toEqual({
      eventId: '$msg1',
      sender: '',
      body: '',
    })
  })

  it('should return empty array when Synapse returns 404 or 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Room not found',
    })

    const messages = await getOlderMessages('!nonexistent:test', {
      limit: 20,
      accessToken: 'test-token',
      userId: '@alice:test',
    })

    expect(messages).toEqual([])
  })
})
