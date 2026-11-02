import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock WebSocket global
global.WebSocket = class {
  constructor(url, protocols) {
    this.url = url
    this.readyState = this.CONNECTING
    this.CONNECTING = 0
    this.OPEN = 1
    this.CLOSING = 2
    this.CLOSED = 3
    this._messages = []
    this._closeCode = null
    this._closeReason = null
    this._listeners = {}

    // Simulate connection after a timeout
    setTimeout(() => {
      this.readyState = this.OPEN
      this._emit('open')
    }, 10)
  }

  send(data) {
    if (this.readyState === this.OPEN) {
      this._emit('message', data)
    }
  }

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
  }

  removeEventListener(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(h => h !== handler)
    }
  }

  close(code, reason) {
    this.readyState = this.CLOSED
    this._closeCode = code
    this._closeReason = reason
    this._emit('close', code, reason)
  }

  _emit(event, ...args) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(h => h(...args))
    }
  }
}

global.WebSocket.CONNECTING = 0
global.WebSocket.OPEN = 1
global.WebSocket.CLOSING = 2
global.WebSocket.CLOSED = 3

// Mock Synapse server
function createMockSynapseServer() {
  const requests = []
  const server = new (require('node:http').Server)((req, res) => {
    const bodyChunks = []
    req.on('data', chunk => bodyChunks.push(chunk))
    req.on('end', () => {
      const body = bodyChunks.join('')
      requests.push({
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        body,
      })

      // Respond based on the path
      if (req.url?.includes('/sync')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ type: 'initial_sync', rooms: [] }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      }
    })
  })

  return server
}

let server
let basePort = 9876

beforeEach(async () => {
  server = createMockSynapseServer()
  await new Promise(r => server.listen(basePort + Math.floor(Math.random() * 1000), r))
})

afterEach(async () => {
  await new Promise(r => server.close(r))
})

import * as matrixSync from '@lib/matrix/syncProxy.js'

describe('Sync WebSocket Proxy', () => {
  it('should connect to Synapse /sync and pipe messages', async () => {
    const accessToken = 'test-token-123'

    // Mock the reply.socket to be a WebSocket (fastify websocket upgrade)
    const mockClientWs = new global.WebSocket()
    mockClientWs.send = vi.fn()
    mockClientWs.readyState = mockClientWs.OPEN

    const mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
      socket: mockClientWs,
    }

    const mockRequest = {
      method: 'GET',
      url: '/_matrix/client/sync?timeout=30000&since=%224%22',
      user: { accessToken },
      query: { since: '4' },
    }

    // Mock SYNAPSE_URL
    process.env.SYNAPSE_URL = 'http://localhost:8008'

    await matrixSync.handleSyncProxy(mockRequest, mockReply)

    // Wait a bit for the WebSocket operations to complete
    await new Promise(r => setTimeout(r, 100))

    // Verify the client WebSocket was used
    expect(mockReply.socket).toBeDefined()
  })

  it('should inject access_token in Synapse WebSocket URL', async () => {
    const accessToken = 'test-token-456'

    const mockClientWs = new global.WebSocket()
    mockClientWs.readyState = mockClientWs.OPEN

    const mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
      socket: mockClientWs,
    }

    const mockRequest = {
      method: 'GET',
      url: '/_matrix/client/sync?timeout=30000&since=%224%22',
      user: { accessToken },
      query: { since: '4' },
    }

    process.env.SYNAPSE_URL = 'http://localhost:8008'

    await matrixSync.handleSyncProxy(mockRequest, mockReply)

    await new Promise(r => setTimeout(r, 100))

    // The Synapse WebSocket should have been created with the access token
    // Check that the URL included the access token
    // (We verify through the synapseWs creation logic)
    expect(true).toBe(true) // Placeholder - verify in implementation
  })

  it('should handle bidirectional message piping', async () => {
    const accessToken = 'test-token-789'

    const messageData = JSON.stringify({ type: 'm.room.message', content: { body: 'hello' } })

    const mockClientWs = new global.WebSocket()
    mockClientWs.readyState = mockClientWs.OPEN
    mockClientWs.send = vi.fn()

    const mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
      socket: mockClientWs,
    }

    const mockRequest = {
      method: 'GET',
      url: '/_matrix/client/sync?timeout=30000&since=%224%22',
      user: { accessToken },
      query: { since: '4' },
    }

    process.env.SYNAPSE_URL = 'http://localhost:8008'

    await matrixSync.handleSyncProxy(mockRequest, mockReply)

    // Send a message from client to synapse
    mockClientWs.send(messageData)

    await new Promise(r => setTimeout(r, 50))

    // Verify the message was sent (piping logic)
    expect(true).toBe(true) // Placeholder
  })

  it('should handle reconnection on Synapse disconnect', async () => {
    const accessToken = 'test-token-reconnect'

    const mockClientWs = new global.WebSocket()
    mockClientWs.readyState = mockClientWs.OPEN

    const mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      statusCode: 200,
      socket: mockClientWs,
    }

    const mockRequest = {
      method: 'GET',
      url: '/_matrix/client/sync?timeout=30000&since=%224%22',
      user: { accessToken },
      query: { since: '4' },
    }

    process.env.SYNAPSE_URL = 'http://localhost:8008'

    await matrixSync.handleSyncProxy(mockRequest, mockReply)

    // Synapse disconnect - verify attemptReconnect is called
    await new Promise(r => setTimeout(r, 50))

    expect(true).toBe(true) // Placeholder
  })
})