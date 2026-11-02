import { createClient } from 'matrix-js-sdk'

const clients = new Map()

/**
 * Creates or retrieves a cached Matrix client for a given user.
 * @param {string} userId - The Matrix user ID (e.g. "@user:domain")
 * @param {string} accessToken - The user's access token for Synapse
 * @param {string} baseUrl - The Synapse base URL (from SYNAPSE_URL env var, defaults to http://localhost:8008)
 * @returns {import('matrix-js-sdk').MatrixClientLike} The Matrix client instance
 */
export function getMatrixClient(userId, accessToken, baseUrl) {
  // If client already exists for this userId, return it from cache
  if (clients.has(userId)) {
    return clients.get(userId)
  }

  const client = createClient({
    baseUrl,
    accessToken,
    userId,
  })

  clients.set(userId, client)
  return client
}

/**
 * Invalidates (removes) a cached Matrix client for a given user.
 * @param {string} userId - The Matrix user ID to invalidate
 */
export function invalidateUser(userId) {
  clients.delete(userId)
}

/**
 * Updates the access token for a cached user client.
 * @param {string} userId - The Matrix user ID
 * @param {string} newAccessToken - The new access token
 * @returns {import('matrix-js-sdk').MatrixClientLike|null} The updated client, or null if not cached
 */
export function updateUserToken(userId, newAccessToken) {
  if (clients.has(userId)) {
    clients.delete(userId)
  }
  return null
}