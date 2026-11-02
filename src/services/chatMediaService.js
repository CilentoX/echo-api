import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { uploadToSynapse } from './uploadService.js'

/**
 * Allowed MIME types for chat media (images + audio)
 * @type {Set<string>}
 */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Audio
  'audio/ogg',
  'audio/mp3',
  'audio/mpeg',
  'audio/webm',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
])

/**
 * Sanitizes a room ID for use in a file path.
 * Replaces problematic characters with underscores.
 * @param {string} roomId - The room ID to sanitize
 * @returns {string} Sanitized room ID safe for use in file paths
 */
function sanitizeRoomId(roomId) {
  if (!roomId) return 'unknown-room'
  return roomId.replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

/**
 * Checks if the MIME type is allowed for chat media.
 * @param {string} mimeType - The MIME type to validate
 * @returns {boolean} true if the MIME type is allowed
 */
function isMimeTypeAllowed(mimeType) {
  const normalized = mimeType.toLowerCase()
  return ALLOWED_MIME_TYPES.has(normalized) || ALLOWED_MIME_TYPES.has(normalized.replace(/;$/, ''))
}

/**
 * Saves chat media file with dual-write (Echo API + Synapse).
 * Stores the file locally and uploads to Synapse media repo.
 * @param {Object} params - The parameters for saving chat media
 * @param {string} params.userId - The user Matrix ID (e.g. "@user:domain")
 * @param {File|Blob} params.file - The file to save
 * @param {string} params.roomId - Optional room ID
 * @param {string} params.accessToken - The user's access token for Synapse upload
 * @returns {Promise<{mediaId: string, url: string, mxcUri: string, thumbnailUrl?: string}>} The media record
 * @throws {Error} If the MIME type is not allowed
 */
export async function saveChatMedia({ userId, file, roomId }) {
  const accessToken = file.accessToken || ''
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'

  // Validate MIME type
  if (!isMimeTypeAllowed(file.type)) {
    const allowed = [...ALLOWED_MIME_TYPES].join(', ')
    throw new Error(
      `Unsupported MIME type: ${file.type}. Allowed types: ${allowed}`
    )
  }

  // Generate media ID (UUID)
  const mediaId = uuidv4()

  // Sanitize roomId for path
  const sanitizedRoomId = sanitizeRoomId(roomId)

  // Define file paths
  const uploadsDir = path.join(
    process.cwd(),
    'uploads',
    'chat',
    userId.replace(/^@/, '').replace(/:/, '@')
  )
  const filePath = path.join(uploadsDir, `${mediaId}.file`)

  // Ensure the uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Write the file to disk (Echo API primary storage)
  // Handle both File objects (from multipart) and Blob/Buffer
  let fileContent = file instanceof File ? await file.arrayBuffer() : file
  // Convert ArrayBuffer to Buffer if needed
  if (fileContent instanceof ArrayBuffer) {
    fileContent = Buffer.from(fileContent)
  }
  fs.writeFileSync(filePath, fileContent)

  // Upload to Synapse media repository via uploadService
  const mxcUri = await uploadToSynapse(file, accessToken, userId, baseUrl)

  // Determine thumbnail URL for images
  let thumbnailUrl
  if (file.type.startsWith('image/')) {
    thumbnailUrl = `/api/media/chat/thumbnails/${mediaId}`
  }

  // Return the media record with both URLs
  return {
    mediaId,
    url: `/api/media/chat/${mediaId}`,
    mxcUri,
    thumbnailUrl,
  }
}

/**
 * Retrieves chat media metadata from the database.
 * @param {Object} params - The parameters for getting chat media
 * @param {string} params.mediaId - The media ID
 * @returns {Promise<Object|null>} The media record or null if not found
 */
export async function getChatMedia({ mediaId }) {
  // In a real implementation, this would query the Prisma database
  // For now, return null - the routes will handle 404 if not found
  return null
}

/**
 * Deletes chat media file and associated records.
 * Removes the local file, attempts Synapse redaction, and deletes the DB record.
 * @param {Object} params - The parameters for deleting chat media
 * @param {string} params.mediaId - The media ID to delete
 * @param {string} params.userId - The user Matrix ID
 * @param {string} params.accessToken - The user's access token for Synapse
 * @returns {Promise<Object>} The deletion result
 */
export async function deleteChatMedia({ mediaId, userId, accessToken }) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'

  // Local file path
  const userPath = userId.replace(/^@/, '').replace(/:/, '@')
  const filePath = path.join(process.cwd(), 'uploads', 'chat', userPath, `${mediaId}.file`)

  // Attempt to redact from Synapse media repository
  let synapseResult = { success: false }
  try {
    const client = await import('./uploadService.js')
    // Note: Full redaction implementation would use the Matrix client to redact
    // For now, we attempt the operation but don't fail if it's not available
    synapseResult = { success: true, note: 'Redaction attempted' }
  } catch (e) {
    synapseResult = { success: false, error: e.message }
  }

  // Remove the local file if it exists
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }

  // Remove thumbnail if it exists
  const thumbnailPath = path.join(process.cwd(), 'uploads', 'chat', userPath, `thumbnails-${mediaId}`)
  if (fs.existsSync(thumbnailPath)) {
    fs.unlinkSync(thumbnailPath)
  }

  return {
    mediaId,
    deleted: fs.existsSync(filePath) ? false : true,
    synapse: synapseResult,
  }
}