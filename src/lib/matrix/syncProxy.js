import { WebSocket } from 'ws'

const SYNAPSE_SYNC_PATH = '/_matrix/client/sync'
const DEFAULT_TIMEOUT = 30000

/**
 * Handles the /matrix/sync WebSocket proxy.
 * Streams Synapse /sync to the connected client with bidirectional piping.
 *
 * @param {object} request - Fastify request object (expected to have `user.accessToken`)
 * @param {object} reply - Fastify reply object (socket is the WebSocket after upgrade)
 * @returns {void}
 */
export async function handleSyncProxy(request, reply) {
  // WebSocket in browsers/Tauri cannot set custom headers, so accept token via query param.
  // Fall back to request.user.accessToken when the authenticate preHandler has already run.
  const accessToken = request.query?.access_token || request.user?.accessToken
  if (!accessToken) {
    reply.code(401).send({ error: 'Unauthorized: no access token' })
    return
  }

  const since = request.query.since || ''
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const synapseWsUrl = `${baseUrl}${SYNAPSE_SYNC_PATH}?access_token=${accessToken}&timeout=30000&since=${encodeURIComponent(since)}`

  let synapseWs = null
  let clientWs = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5

  // Create Synapse WebSocket connection
  function connectSynapse() {
    synapseWs = new WebSocket(synapseWsUrl)

    synapseWs.on('open', () => {
      reconnectAttempts = 0
      console.log('Synapse /sync WebSocket connected')
    })

    synapseWs.on('message', (data) => {
      if (clientWs && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(data)
      }
    })

    synapseWs.on('close', () => {
      console.log('Synapse /sync WebSocket closed, attempting reconnect...')
      attemptReconnect()
    })

    synapseWs.on('error', (err) => {
      console.error('Synapse /sync WebSocket error:', err)
    })
  }

  // Attempt to reconnect Synapse with updated since token
  function attemptReconnect() {
    reconnectAttempts++

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      if (clientWs) {
        clientWs.close()
      }
      return
    }

    // Reconnect with a delay, using the last known since token
    // We'll get a fresh since from the client on next connection
    setTimeout(connectSynapse, 1000 * Math.min(reconnectAttempts, 3))
  }

  // The client WebSocket is available via reply.socket after fastify upgrades
  // Set up piping once the client socket is available
  const checkClientAndPipe = setInterval(() => {
    if (reply.socket && reply.socket.readyState === reply.socket.OPEN) {
      clearInterval(checkClientAndPipe)
      clientWs = reply.socket

      // Synapse -> Client piping (already handled by synapseWs 'message' above,
      // but let's ensure it's set up correctly)

      // Client -> Synapse piping
      clientWs.on('message', (data) => {
        if (synapseWs && synapseWs.readyState === synapseWs.OPEN) {
          synapseWs.send(data)
        }
      })

      // Handle client disconnect
      clientWs.on('close', () => {
        console.log('Client WebSocket closed, attempting Synapse reconnect...')
        attemptReconnect()
        if (synapseWs) {
          synapseWs.close()
        }
      })

      // Handle client error
      clientWs.on('error', (err) => {
        console.error('Client WebSocket error:', err)
      })
    }
  }, 100)

  // Set a timeout for the overall sync operation
  const timeoutId = setTimeout(() => {
    console.log('Sync proxy timeout reached')
    clearInterval(checkClientAndPipe)
    if (clientWs) {
      clientWs.close()
    }
    if (synapseWs) {
      synapseWs.close()
    }
    reply.code(504).send({ error: 'Sync proxy timeout' })
  }, DEFAULT_TIMEOUT)

  // Initiate the Synapse WebSocket connection
  connectSynapse()
}