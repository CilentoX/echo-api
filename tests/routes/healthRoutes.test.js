import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from '../../src/app.js'

describe('Healthcheck Endpoints', () => {
  beforeEach(async () => {
    await app.ready()
  })

  it('GET /health deve retornar 200 com status ok e metadados', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.status).toBe('ok')
    expect(data.version).toBe('1.0.0')
    expect(data.service).toBe('echo-api')
    expect(typeof data.uptime).toBe('number')
    expect(data.timestamp).toBeDefined()
  })

  it('HEAD /health deve retornar 200 sem corpo', async () => {
    const res = await app.inject({
      method: 'HEAD',
      url: '/health',
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/health deve responder para checagens de proxy/coolify', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.status).toBe('ok')
  })

  it('GET /healthz deve responder para probes de orquestrador', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.status).toBe('ok')
  })

  it('GET / deve responder 200 identificando a API', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.status).toBe('ok')
    expect(data.message).toBe('Echo API')
  })
})

