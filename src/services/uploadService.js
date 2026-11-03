import { createClient } from 'matrix-js-sdk'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const clients = new Map()

/**
 * Upload service - provides saveFile and deleteFile for upload routes.
 */
export const uploadService = {
  /**
   * Save an uploaded file to local storage and Synapse.
   * @param {object} file - Fastify multipart file object
   * @returns {Promise<object>} { fileId, url, mxcUri, contentUri, mimeType, size, originalName, path }
   */
  async saveFile(file) {
    const mediaId = uuidv4()
    const uploadsDir = path.join(process.cwd(), 'uploads')
    const filePath = path.join(uploadsDir, `${mediaId}.file`)
    const metaPath = path.join(uploadsDir, `${mediaId}.meta.json`)

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const fileContent = typeof file.toBuffer === 'function' ? await file.toBuffer() : file.data
    fs.writeFileSync(filePath, fileContent)

    const mimeType = file.mimetype || 'application/octet-stream'
    const originalName = file.filename || `${mediaId}.bin`
    const size = file.file ? file.file.length : fileContent.length

    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        mimeType,
        originalName,
        size,
        createdAt: new Date().toISOString(),
      })
    )

    const apiBase = process.env.API_BASE_URL || 'https://echo-api.litteris.online'

    return {
      fileId: mediaId,
      url: `/api/uploads/${mediaId}`,
      mxcUri: `${apiBase}/api/uploads/${mediaId}`,
      contentUri: `${apiBase}/api/uploads/${mediaId}`,
      mimeType,
      size,
      originalName,
      path: filePath,
    }
  },

  /**
   * Delete a stored file by its ID.
   * @param {string} fileId - The file ID
   * @returns {Promise<object>} { deleted: boolean }
   */
  async deleteFile(fileId) {
    const filePath = path.join(process.cwd(), 'uploads', `${fileId}.file`)
    const metaPath = path.join(process.cwd(), 'uploads', `${fileId}.meta.json`)
    let deleted = false
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      deleted = true
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath)
    }
    return { deleted }
  },
}

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
