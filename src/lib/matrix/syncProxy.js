/**
 * Handles the /matrix/sync WebSocket proxy.
 *
 * The client (desktop app) connects via WebSocket. This handler polls
 * Synapse's HTTP /_matrix/client/v3/sync endpoint in a loop and streams
 * each JSON response to the client over the WebSocket.
 *
 * Synapse does NOT support WebSocket on /sync — only HTTP long-polling.
 *
 * IMPORTANT: This function must NOT be async. @fastify/websocket v11 treats
 * async handlers as regular HTTP route handlers and will attempt to send an
 * HTTP response on the upgraded socket, immediately closing the connection.
 * We use a synchronous wrapper that kicks off the async work via .catch().
 *
 * @param {import('ws').WebSocket} socket - The client WebSocket connection
 * @param {object} request - Fastify request object
 */
export function handleSyncProxy(socket, request) {
  // Fire-and-forget the async work; do NOT return a promise to Fastify
  runSyncLoop(socket, request).catch((err) => {
    console.error('[syncProxy] Unhandled error in sync loop:', err)
  })
}

/**
 * Internal async implementation of the sync loop.
 * Separated from the exported handler to keep the export synchronous.
 */
async function runSyncLoop(socket, request) {
  const accessToken = request.query?.access_token
  if (!accessToken) {
    socket.close(4001, 'Unauthorized: no access token')
    return
  }

  let since = request.query.since || ''
  const timeout = parseInt(request.query.timeout, 10) || 30000
  const baseUrl = (process.env.SYNAPSE_URL || 'http://localhost:8008').replace(/\/$/, '')
  let closed = false

  console.log('[syncProxy] Client WebSocket connected, starting HTTP sync loop')

  // Clean up on client disconnect
  socket.on('close', () => {
    console.log('[syncProxy] Client WebSocket closed')
    closed = true
  })

  socket.on('error', (err) => {
    console.error('[syncProxy] Client WebSocket error:', err.message)
    closed = true
  })

  // Long-poll loop: fetch from Synapse, forward to client, repeat
  while (!closed && socket.readyState === socket.OPEN) {
    try {
      const params = new URLSearchParams({
        access_token: accessToken,
        timeout: String(timeout),
      })
      if (since) {
        params.set('since', since)
      }

      const url = `${baseUrl}/_matrix/client/v3/sync?${params.toString()}`
      const controller = new AbortController()
      const fetchTimeout = setTimeout(() => controller.abort(), timeout + 10000)

      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(fetchTimeout)

      if (!response.ok) {
        console.error(`[syncProxy] Synapse sync returned ${response.status}: ${response.statusText}`)
        // On auth failure, close the client socket
        if (response.status === 401) {
          socket.close(4001, 'Synapse authentication failed')
          break
        }
        // Wait before retrying on other errors
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }

      const data = await response.json()

      // Update since token for next poll
      if (data.next_batch) {
        since = data.next_batch
      }

      // Forward the sync response to the client
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(data))
      }
    } catch (err) {
      if (closed) break
      if (err.name === 'AbortError') {
        console.log('[syncProxy] Sync fetch timed out, retrying...')
        continue
      }
      console.error('[syncProxy] Sync fetch error:', err.message)
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  console.log('[syncProxy] Sync loop ended')
}