import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from 'matrix-js-sdk'
import * as matrixClient from '../src/lib/matrix/client.js'

describe('Matrix Client Factory', () => {
  beforeEach(() => {
    // Clear the cache before each test
    matrixClient.invalidateUser('user1')
    matrixClient.invalidateUser('user2')
  })

  afterEach(() => {
    matrixClient.invalidateUser('user1')
    matrixClient.invalidateUser('user2')
  })

  it('creates a Matrix client with userId, accessToken, and baseUrl', () => {
    const client = matrixClient.getMatrixClient('user1', 'test-access-token', 'http://echo-postgres:8008')
    expect(client).toBeDefined()
    expect(client.baseUrl).toBe('http://echo-postgres:8008')
  })

  it('reuses client per userId (cache)', () => {
    const client1 = matrixClient.getMatrixClient('user1', 'token1', 'http://echo-postgres:8008')
    const client2 = matrixClient.getMatrixClient('user1', 'token2', 'http://echo-postgres:8008')
    expect(client1).toBe(client2)
  })

  it('different userIds get different clients', () => {
    const client1 = matrixClient.getMatrixClient('user1', 'token1', 'http://echo-postgres:8008')
    const client2 = matrixClient.getMatrixClient('user2', 'token2', 'http://echo-postgres:8008')
    expect(client1).not.toBe(client2)
  })

  it('invalidateUser removes the client from cache', () => {
    const client = matrixClient.getMatrixClient('user1', 'token1', 'http://echo-postgres:8008')
    matrixClient.invalidateUser('user1')
    const clientAfter = matrixClient.getMatrixClient('user1', 'token1', 'http://echo-postgres:8008')
    // Should create a new client after invalidation
    expect(clientAfter).toBeDefined()
    expect(clientAfter).not.toBe(client)
  })
})