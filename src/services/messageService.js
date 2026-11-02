import { getMatrixClient } from './chatMediaService.js'
import { saveChatMedia } from './chatMediaService.js'

/**
 * Sends a message to a Matrix room.
 * Handles text, file, image, and audio messages with media resolution.
 *
 * @param {string} roomId - The Matrix room ID (e.g. "!room:domain")
 * @param {Object} params - The parameters for sending the message
 * @param {string} params.body - The message body/text content
 * @param {string} [params.msgtype] - The message type: 'm.text', 'm.file', 'm.image', 'm.audio'
 * @param {string} [params.mediaId] - Optional media ID for file/image/audio messages
 * @param {string} [params.accessToken] - The user's access token
 * @param {string} [params.userId] - The user's Matrix ID
 * @returns {Promise<Object>} { eventId, timestamp }
 * @throws {Error} If the message send fails or media resolution fails
 */
export async function sendMessage(roomId, { body, msgtype, mediaId, accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // If mediaId is provided, resolve it to mxcUri via chatMediaService
  let mxcUri = null
  if (mediaId) {
    const media = await saveChatMedia({ userId, file: { type: 'application/octet-stream', name: mediaId }, roomId })
    mxcUri = media.mxcUri
  }

  // Determine the content based on msgtype
  let content

  switch (msgtype) {
    case 'm.text':
      content = { body }
      break

    case 'm.file':
    case 'm.image':
    case 'm.audio':
      if (!mxcUri) {
        throw new Error(`mxcUri required for msgtype ${msgtype}`)
      }
      content = {
        [msgtype]: {
          url: mxcUri,
          info: {
            mimetype: media.info?.mimetype || '',
            size: media.info?.size || 0,
          },
        },
      }
      // For audio, add duration if available
      if (msgtype === 'm.audio' && media.info?.duration) {
        content[msgtype].info.duration = media.info.duration
      }
      break

    default:
      // Default to text
      content = { body }
      break
  }

  // Send the message via Matrix
  // Use sendEvent for media types, sendMessage for text
  let eventId, timestamp

  if (msgtype === 'm.text') {
    const result = await client.sendMessage(roomId, content, 'm.text')
    eventId = result.event_id
    timestamp = result.timestamp
  } else {
    const result = await client.sendEvent(roomId, 'm.room.message', content, null)
    eventId = result.event_id
    timestamp = result.timestamp
  }

  return { eventId, timestamp }
}

/**
 * Edits a message in a Matrix room (m.replace).
 *
 * @param {string} roomId - The Matrix room ID
 * @param {string} eventId - The event ID of the message to edit
 * @param {Object} params - The parameters for editing the message
 * @param {string} params.body - The new message body/content
 * @param {string} [params.accessToken] - The user's access token
 * @param {string} [params.userId] - The user's Matrix ID
 * @returns {Promise<Object>} The Matrix response
 * @throws {Error} If the edit fails
 */
export async function editMessage(roomId, eventId, { body, accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // Use m.replace to edit the message
  const response = await client.replaceEvent(roomId, eventId, {
    body,
  })

  return response
}

/**
 * Redacts a message in a Matrix room.
 *
 * @param {string} roomId - The Matrix room ID
 * @param {string} eventId - The event ID of the message to redact
 * @param {string} [params.accessToken] - The user's access token
 * @param {string} [params.userId] - The user's Matrix ID
 * @returns {Promise<Object>} The Matrix response
 * @throws {Error} If the redaction fails
 */
export async function redactMessage(roomId, eventId, { accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // Use the Matrix client to redact the event
  const response = await client.redactEvent(roomId, eventId)

  return response
}

/**
 * Reacts to a message in a Matrix room (m.reaction).
 *
 * @param {string} roomId - The Matrix room ID
 * @param {string} eventId - The event ID of the message to react to
 * @param {Object} params - The parameters for reacting
 * @param {string} params.key - The reaction key (e.g., "m.emote", "👍", ":thumbsup:")
 * @param {string} [params.accessToken] - The user's access token
 * @param {string} [params.userId] - The user's Matrix ID
 * @returns {Promise<Object>} The Matrix response
 * @throws {Error} If the reaction fails
 */
export async function reactToMessage(roomId, eventId, { key, accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'http://localhost:8008'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // Use m.reaction with m.relates_to
  const response = await client.sendReaction(roomId, eventId, key)

  return response
}