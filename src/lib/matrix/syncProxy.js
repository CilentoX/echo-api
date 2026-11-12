import { WebSocket } from 'ws'

const SYNAPSE_SYNC_PATH = '/_matrix/client/sync'
const DEFAULT_TIMEOUT = 30000

/**
 * Handles the /matrix/sync WebSocket proxy.
 * Streams Synapse /sync to the connected client with bidirectional piping.
 *
 * @param {object} connection - @fastify/websocket connection object (connection.socket is the WebSocket)
 * @param {object} request - Fastify request object
 * @returns {void}
 */
export async function handleSyncProxy(connection, request) {
  // WebSocket in browsers/Tauri cannot set custom headers, so accept token via query param.
  const accessToken = request.query?.access_token
  if (!accessToken) {
    connection.socket.close(4001, 'Unauthorized: no access token')
    return
  }

  const since = request.query.since || ''
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const synapseWsUrl = `${baseUrl}${SYNAPSE_SYNC_PATH}?access_token=${accessToken}&timeout=30000&since=${encodeURIComponent(since)}`

  const clientWs = connection.socket
  let synapseWs = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5

  // Create Synapse WebSocket connection
  function connectSynapse() {
    synapseWs = new WebSocket(synapseWsUrl)

    synapseWs.on('open', () => {
      reconnectAttempts = 0
      console.log('[syncProxy] Synapse /sync WebSocket connected')
    })

    synapseWs.on('message', (data) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(data)
      }
    })

    synapseWs.on('close', () => {
      console.log('[syncProxy] Synapse /sync WebSocket closed, attempting reconnect...')
      attemptReconnect()
    })

    synapseWs.on('error', (err) => {
      console.error('[syncProxy] Synapse /sync WebSocket error:', err.message)
    })
  }

  // Attempt to reconnect Synapse with updated since token
  function attemptReconnect() {
    reconnectAttempts++

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('[syncProxy] Max reconnect attempts reached')
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.close()
      }
      return
    }

    setTimeout(connectSynapse, 1000 * Math.min(reconnectAttempts, 3))
  }

  // Client -> Synapse piping
  clientWs.on('message', (data) => {
    if (synapseWs && synapseWs.readyState === synapseWs.OPEN) {
      synapseWs.send(data)
    }
  })

  // Handle client disconnect
  clientWs.on('close', () => {
    console.log('[syncProxy] Client WebSocket closed')
    if (synapseWs) {
      synapseWs.close()
    }
  })

  // Handle client error
  clientWs.on('error', (err) => {
    console.error('[syncProxy] Client WebSocket error:', err.message)
  })

  // Set a timeout for the overall sync operation
  const timeoutId = setTimeout(() => {
    console.log('[syncProxy] Sync proxy timeout reached')
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.close()
    }
    if (synapseWs) {
      synapseWs.close()
    }
  }, DEFAULT_TIMEOUT)

  // Clean up timeout on close
  clientWs.on('close', () => {
    clearTimeout(timeoutId)
  })

  // Initiate the Synapse WebSocket connection
  connectSynapse()
}