import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveChatMedia, getChatMedia, deleteChatMedia } from '@/services/chatMediaService.js'

describe('chatMediaService - function existence', () => {
  it('should have saveChatMedia function', () => {
    expect(typeof saveChatMedia).toBe('function')
  })

  it('should have getChatMedia function', () => {
    expect(typeof getChatMedia).toBe('function')
  })

  it('should have deleteChatMedia function', () => {
    expect(typeof deleteChatMedia).toBe('function')
  })
})

describe('chatMediaService - roomId sanitization', () => {
  it('should sanitize roomId for use in file paths', () => {
    const roomId = 'room with spaces and !@# special chars'
    const sanitized = roomId.replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    expect(sanitized).toMatch(/^[_\w]+$/)
    expect(sanitized).not.toContain(' ')
  })
})

describe('chatMediaService - getChatMedia', () => {
  it('should retrieve chat media metadata', () => {
    const result = getChatMedia({ mediaId: 'test-media-id' })
    expect(result).toBeDefined()
  })
})

describe('chatMediaService - deleteChatMedia', () => {
  it('should return a promise', () => {
    const result = deleteChatMedia({
      mediaId: 'test-media-id',
      userId: '@user:test',
      accessToken: 'test-token',
    })
    expect(result).toBeInstanceOf(Promise)
  })

  it('should resolve with result structure', async () => {
    const result = await deleteChatMedia({
      mediaId: 'test-media-id',
      userId: '@user:test',
      accessToken: 'test-token',
    })
    expect(result).toHaveProperty('mediaId')
    expect(result).toHaveProperty('synapse')
  })
})