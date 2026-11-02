import undici from 'undici'
import { URL } from 'url'

/**
 * Generic HTTP proxy that forwards requests to Synapse with auth injection.
 *
 * @param {object} request - Fastify request object (expected to have `user.accessToken`)
 * @param {object} reply - Fastify reply object
 * @param {string} matrixPath - The Matrix/Synapse path to forward to
 * @returns {Promise<void>} Resolves when the proxy operation completes
 */
export async function proxyToMatrix(request, reply, matrixPath) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const accessToken = request.user?.accessToken

  if (!accessToken) {
    reply.code(401).send({ error: 'Unauthorized: no access token' })
    return
  }

  // Parse baseUrl, handling default ports (80/443) correctly
  const parsedBaseUrl = new URL(baseUrl)
  const port = parsedBaseUrl.port || (parsedBaseUrl.protocol === 'https:' ? '443' : '80')

  const options = {
    method: request.method,
    path: matrixPath,
    hostname: parsedBaseUrl.hostname,
    port: port,
    headers: {},
  }

  // Copy relevant headers from the request
  // Exclude hop-by-hop headers that shouldn't be forwarded
  const hopByHopHeaders = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
  ]

  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase()
    // Always inject authorization Bearer token
    if (lowerKey === 'authorization') {
      options.headers.authorization = `Bearer ${accessToken}`
    }
    // Forward content-type and accept
    else if (lowerKey === 'content-type' || lowerKey === 'accept') {
      options.headers[lowerKey] = value
    }
    // Forward other non-hop-by-hop headers
    else if (!hopByHopHeaders.includes(lowerKey)) {
      options.headers[lowerKey] = value
    }
  }
  // Ensure authorization is set even if not in original headers
  if (!options.headers.authorization) {
    options.headers.authorization = `Bearer ${accessToken}`
  }

  try {
    const { request: undiciRequest, abortController } = await undici.request(options)

    // Handle the response
    const handleResponse = async (undiciResponse) => {
      const statusCode = undiciResponse.statusCode
      const responseHeaders = {}

      for (const [key, value] of Object.entries(undiciResponse.headers)) {
        responseHeaders[key] = value
      }

      // Collect response body rather than passing ReadableStream directly
      const body = await undiciResponse.text()
      reply.statusCode(statusCode).headers(responseHeaders).send(body)
    }

    undiciRequest.on('response', handleResponse)

    // Write request body once (if present)
    if (request.body) {
      undiciRequest.write(request.body)
    }

    // Wait for the response to complete with timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Proxy timeout'))
      }, 30000)
      undiciRequest.on('end', () => {
        clearTimeout(timeout)
        resolve()
      })
      undiciRequest.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
      abortController?.abort()
    })
  } catch (error) {
    reply.code(502).send({ error: 'Proxy error', details: error.message })
  }
}