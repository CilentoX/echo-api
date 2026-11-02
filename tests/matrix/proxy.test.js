import http from 'node:http'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Synapse server
function createMockSynapseServer() {
  const requests = []
  const server = http.createServer((req, res) => {
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
        res.end(JSON.stringify({ type: 'initial_sync' }))
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

import * as matrixProxy from '../src/lib/matrix/proxy.js'

function createReply() {
  const code = vi.fn().mockReturnThis()
  const headers = vi.fn().mockReturnThis()
  const setHeader = vi.fn().mockReturnThis()
  const send = vi.fn()
  const json = vi.fn().mockReturnThis()
  return { code, headers, setHeader, send, json, statusCode: 200 }
}

describe('Generic Matrix Proxy', () => {
  it('forwards GET request to Synapse', async () => {
    const accessToken = 'test-token-123'
    const matrixPath = '/_matrix/client/v3/rooms'

    const request = {
      method: 'GET',
      url: matrixPath,
      headers: { authorization: `Bearer ${accessToken}` },
      user: { accessToken },
    }

    const reply = createReply()

    await matrixProxy.proxyToMatrix(request, reply, matrixPath)

    // Proxy should forward the request and call reply.send
    expect(reply.send).toBeCalled()
  })

  it('forwards POST request with body to Synapse', async () => {
    const accessToken = 'test-token-456'
    const matrixPath = '/_matrix/client/v3/rooms/test/state/m/$my_event'

    const request = {
      method: 'POST',
      url: matrixPath,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'value' }),
      user: { accessToken },
    }

    const reply = createReply()

    await matrixProxy.proxyToMatrix(request, reply, matrixPath)

    expect(reply.send).toBeCalled()
  })

  it('forwards PUT request to Synapse', async () => {
    const accessToken = 'my-secret-token'
    const matrixPath = '/_matrix/client/v3/account/password'

    const request = {
      method: 'PUT',
      url: matrixPath,
      headers: {},
      user: { accessToken },
    }

    const reply = createReply()

    await matrixProxy.proxyToMatrix(request, reply, matrixPath)

    expect(reply.send).toBeCalled()
  })
})