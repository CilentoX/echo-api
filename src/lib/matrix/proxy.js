const FORBIDDEN_PATTERNS = [
  /\/admin\b/i,
  /_synapse\/admin/i,
  /\/_matrix\/federation/i,
  /_matrix\/key/i,
]

const ALLOWED_PREFIXES = [
  '/_matrix/client/',
  '/_matrix/media/',
]

/**
 * Validates if the requested Matrix path is permitted through the public proxy.
 * Prevents unauthorized access to Synapse admin and federation endpoints.
 *
 * @param {string} matrixPath - The target Matrix path
 * @returns {boolean} True if the path is permitted
 */
export function isPathAllowed(matrixPath) {
  if (!matrixPath || typeof matrixPath !== 'string') return false
  const normalized = matrixPath.startsWith('/') ? matrixPath : `/${matrixPath}`

  if (FORBIDDEN_PATTERNS.some(pattern => pattern.test(normalized))) {
    return false
  }

  return ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix))
}

/**
 * Generic HTTP proxy that forwards requests to Synapse with auth injection.
 *
 * Uses native Node.js `fetch` (available since Node 18, stable in 20)
 * instead of `undici` to avoid `zlib.createZstdDecompress` not being
 * available on some Node 20 builds (e.g. v20.20.2).
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

  if (!isPathAllowed(matrixPath)) {
    reply.code(403).send({ error: 'Forbidden: access to this Matrix endpoint is not permitted via proxy' })
    return
  }

  const hopByHopHeaders = [
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
  ]

  const headers = {}
  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'authorization') {
      headers[lowerKey] = `Bearer ${accessToken}`
    } else if (lowerKey === 'content-type' || lowerKey === 'accept') {
      headers[lowerKey] = value
    } else if (!hopByHopHeaders.includes(lowerKey)) {
      headers[lowerKey] = value
    }
  }
  if (!headers.authorization) {
    headers.authorization = `Bearer ${accessToken}`
  }

  try {
    const url = `${baseUrl}${matrixPath}`
    const body = request.body ? JSON.stringify(request.body) : undefined

    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
    })

    const responseBody = await response.text()
    const responseHeaders = Object.fromEntries(response.headers.entries())

    reply.status(response.status).headers(responseHeaders).send(responseBody)
  } catch (error) {
    reply.code(502).send({ error: 'Proxy error', details: error.message })
  }
}
