/**
 * Profile sync module - syncs user display name to Matrix.
 * Uses the Matrix client to set the displayName on the user's profile.
 */
import { getMatrixClient } from './client.js'

/**
 * Syncs the display name to Matrix for a given user.
 * Calls Matrix client's setDisplayName with the provided nickname.
 *
 * @param {string} userId - The Matrix user ID (e.g. "@user:domain")
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} nickname - The nickname/display name to set
 * @returns {Promise<void>}
 */
export async function syncDisplayNameToMatrix(userId, accessToken, nickname) {
  if (!nickname) {
    // If nickname is null/undefined, clear the display name
    const client = getMatrixClient(userId, accessToken)
    await client.setDisplayName('')
    return
  }

  const client = getMatrixClient(userId, accessToken)
  await client.setDisplayName(nickname)
}