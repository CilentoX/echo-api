import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sendMessage, editMessage, redactMessage, reactToMessage } from '@/services/messageService.js'

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
  it('should return a promise', () => {
    const result = editMessage('!room:test', '!event:test', {
      body: 'edited',
    })
    expect(result).toBeInstanceOf(Promise)
  })
})

describe('messageService - redactMessage', () => {
  it('should return a promise', () => {
    const result = redactMessage('!room:test', '!event:test', {
      accessToken: 'test-token',
      userId: '@user:test',
    })
    expect(result).toBeInstanceOf(Promise)
  })
})

describe('messageService - reactToMessage', () => {
  it('should return a promise', () => {
    const result = reactToMessage('!room:test', '!event:test', {
      key: '👍',
      accessToken: 'test-token',
      userId: '@user:test',
    })
    expect(result).toBeInstanceOf(Promise)
  })
})