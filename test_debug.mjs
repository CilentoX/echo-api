import * as matrixProxy from './src/lib/matrix/proxy.js'

// Mock request/reply
const request = {
  method: 'GET',
  url: '/_matrix/client/v3/rooms',
  headers: { authorization: 'Bearer test-token' },
  user: { accessToken: 'test-token' },
}

const reply = {
  code: vi.fn().mockReturnThis(),
  headers: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  send: vi.fn(),
  json: vi.fn().mockReturnThis(),
  statusCode: 200,
}

async function test() {
  try {
    await matrixProxy.proxyToMatrix(request, reply, '/_matrix/client/v3/rooms')
    console.log('reply.code calls:', reply.code.mock.calls)
    console.log('reply.headers calls:', reply.headers.mock.calls)
    console.log('reply.send calls:', reply.send.mock.calls)
  } catch (e) {
    console.error('Error:', e)
  }
}

test()