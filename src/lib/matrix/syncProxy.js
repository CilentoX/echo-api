import { WebSocket } from 'ws'

const SYNAPSE_SYNC_PATH = '/_matrix/client/sync'
const DEFAULT_TIMEOUT = 30000

/**
 * Handles the /matrix/sync WebSocket proxy.
 * Streams Synapse /sync to the connected client with bidirectional piping.
 *
 * @fastify/websocket v11 passes (socket, request) directly to the handler,
 * where socket is the ws WebSocket instance.
 *
 * @param {import('ws').WebSocket} socket - The client WebSocket connection
 * @param {object} request - Fastify request object
 */
export async function handleSyncProxy(socket, request) {
  // WebSocket in browsers/Tauri cannot set custom headers, so accept token via query param.
  const accessToken = request.query?.access_token
  if (!accessToken) {
    socket.close(4001, 'Unauthorized: no access token')
    return
  }

  const since = request.query.since || ''
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const synapseWsUrl = `${baseUrl.replace(/\/$/, '')}${SYNAPSE_SYNC_PATH}?access_token=${encodeURIComponent(accessToken)}&timeout=30000&since=${encodeURIComponent(since)}`

  let synapseWs = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  let closed = false

  console.log('[syncProxy] Client WebSocket connected, connecting to Synapse...')

  function connectSynapse() {
    if (closed) return

    synapseWs = new WebSocket(synapseWsUrl)

    synapseWs.on('open', () => {
      reconnectAttempts = 0
      console.log('[syncProxy] Synapse /sync WebSocket connected')
    })

    synapseWs.on('message', (data) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(data)
      }
    })

    synapseWs.on('close', () => {
      console.log('[syncProxy] Synapse /sync WebSocket closed')
      if (!closed) attemptReconnect()
    })

    synapseWs.on('error', (err) => {
      console.error('[syncProxy] Synapse /sync WebSocket error:', err.message)
    })
  }

  function attemptReconnect() {
    if (closed) return
    reconnectAttempts++

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('[syncProxy] Max reconnect attempts reached, closing client socket')
      if (socket.readyState === socket.OPEN) {
        socket.close()
      }
      return
    }

    console.log(`[syncProxy] Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts}...`)
    setTimeout(connectSynapse, 1000 * Math.min(reconnectAttempts, 3))
  }

  // Client -> Synapse piping
  socket.on('message', (data) => {
    if (synapseWs && synapseWs.readyState === synapseWs.OPEN) {
      synapseWs.send(data)
    }
  })

  // Handle client disconnect
  socket.on('close', () => {
    console.log('[syncProxy] Client WebSocket closed')
    closed = true
    if (synapseWs) {
      synapseWs.close()
    }
  })

  // Handle client error
  socket.on('error', (err) => {
    console.error('[syncProxy] Client WebSocket error:', err.message)
    closed = true
  })

  // Initiate the Synapse WebSocket connection
  connectSynapse()
}