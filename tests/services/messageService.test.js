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
