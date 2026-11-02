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
 * Uploads a file to the Synapse media repository.
 * Uses the Matrix client's uploadContent method with the user's access token.
 * Returns the mxc:// URI for the uploaded media.
 * @param {File} file - The file to upload
 * @param {string} accessToken - The user's access token
 * @param {string} userId - The Matrix user ID
 * @param {string} baseUrl - The Synapse base URL
 * @returns {Promise<string>} The mxc:// URI (e.g., "mxc://domain/mediaId")
 */
export async function uploadToSynapse(file, accessToken, userId, baseUrl) {
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // Prepare the file for upload
  const fileBlob = {
    uri: file.uri || file.path,
    name: file.name,
    type: file.type,
  }

  // Upload the content to Synapse
  const contentUri = await client.uploadContent(fileBlob, {
    name: file.name,
    type: file.type,
  })

  return contentUri
}

/**
 * Invalidates (removes) a cached Matrix client for a given user.
 * @param {string} userId - The Matrix user ID to invalidate
 */
export function invalidateUser(userId) {
  clients.delete(userId)
}