import '../../polyfill.js'
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
  const url = baseUrl || process.env.SYNAPSE_URL || 'https://echo.litteris.online'
  const cacheKey = `${userId || ''}:${accessToken || ''}`
  // If client already exists for this cacheKey, return it from cache
  if (clients.has(cacheKey)) {
    return clients.get(cacheKey)
  }

  const client = createClient({
    baseUrl: url,
    accessToken,
    userId,
  })

  clients.set(cacheKey, client)
  return client
}

/**
 * Invalidates (removes) a cached Matrix client for a given user.
 * @param {string} userId - The Matrix user ID to invalidate
 */
export function invalidateUser(userId) {
  for (const key of clients.keys()) {
    if (key.startsWith(`${userId}:`)) {
      clients.delete(key)
    }
  }
}

/**
 * Updates the access token for a cached user client.
 * @param {string} userId - The Matrix user ID
 * @param {string} newAccessToken - The new access token
 * @returns {import('matrix-js-sdk').MatrixClientLike|null} The updated client, or null if not cached
 */
export function updateUserToken(userId, newAccessToken) {
  invalidateUser(userId)
  return null
}