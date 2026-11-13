import '../polyfill.js'
import { getMatrixClient } from '../lib/matrix/client.js'
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
export async function sendMessage(roomId, { body, msgtype, mediaId, replyToEventId, accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // If mediaId is provided, resolve it to mxcUri via chatMediaService
  let mxcUri = null
  if (mediaId) {
    const media = await saveChatMedia({ userId, file: { type: 'application/octet-stream', name: mediaId }, roomId })
    mxcUri = media.mxcUri
  }

  // Determine the content based on msgtype
  const effectiveMsgtype = msgtype || 'm.text'
  let content

  switch (effectiveMsgtype) {
    case 'm.text':
      content = { body, msgtype: 'm.text' }
      break

    case 'm.file':
    case 'm.image':
    case 'm.audio':
      if (!mxcUri) {
        throw new Error(`mxcUri required for msgtype ${effectiveMsgtype}`)
      }
      content = {
        [effectiveMsgtype]: {
          url: mxcUri,
          info: {
            mimetype: media?.info?.mimetype || '',
            size: media?.info?.size || 0,
          },
        },
        msgtype: effectiveMsgtype,
      }
      // For audio, add duration if available
      if (effectiveMsgtype === 'm.audio' && media?.info?.duration) {
        content[effectiveMsgtype].info.duration = media.info.duration
      }
      break

    default:
      // Default to text
      content = { body, msgtype: 'm.text' }
      break
  }

  // Add reply relation (m.relates_to with m.in_reply_to) when replying to another message
  if (replyToEventId) {
    content['m.relates_to'] = {
      'm.in_reply_to': {
        event_id: replyToEventId,
      },
    }
  }

  // Send the message via Matrix
  let eventId, timestamp

  const doSend = async () => {
    if (effectiveMsgtype === 'm.text') {
      return client.sendMessage(roomId, content)
    } else {
      return client.sendEvent(roomId, 'm.room.message', content, null)
    }
  }

  try {
    const result = await doSend()
    eventId = result.event_id
    timestamp = result.timestamp
  } catch (err) {
    const isForbidden = err?.errcode === 'M_FORBIDDEN' || err?.httpStatus === 403 || String(err?.message).includes('not in this room')
    if (isForbidden && typeof client.joinRoom === 'function') {
      try {
        await client.joinRoom(roomId)
        const retryResult = await doSend()
        eventId = retryResult.event_id
        timestamp = retryResult.timestamp
      } catch {
        throw err
      }
    } else {
      throw err
    }
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
  const baseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
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
  const baseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
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
  const baseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
  const client = getMatrixClient(userId, accessToken, baseUrl)

  // Use m.reaction with m.relates_to
  const response = await client.sendReaction(roomId, eventId, key)

  return response
}

/**
 * Loads older messages for a Matrix room from Synapse.
 *
 * @param {string} roomId - The Matrix room ID (e.g. "!room:domain")
 * @param {Object} params - Query parameters
 * @param {number} [params.limit=20] - Number of messages to fetch
 * @param {string} [params.from] - Pagination token from Synapse
 * @param {string} params.accessToken - User access token
 * @param {string} [params.userId] - User Matrix ID
 * @returns {Promise<Array<Object>>} Formatted array of message events
 */
export async function getOlderMessages(roomId, { limit = 20, from, accessToken, userId }) {
  const baseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
  const encodedRoomId = encodeURIComponent(roomId)
  let url = `${baseUrl}/_matrix/client/v3/rooms/${encodedRoomId}/messages?dir=b&limit=${encodeURIComponent(limit)}`
  if (from) {
    url += `&from=${encodeURIComponent(from)}`
  }

  let res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  // Se o usuário não tiver entrado na sala ainda (403), tenta entrar e refaz a busca
  if (res.status === 403) {
    try {
      const joinRes = await fetch(`${baseUrl}/_matrix/client/v3/join/${encodedRoomId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (joinRes.ok) {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        })
      }
    } catch {}
  }

  if (!res.ok) {
    if (res.status === 404 || res.status === 403) {
      return []
    }
    const errText = await res.text()
    throw new Error(`Matrix Synapse error (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const chunk = Array.isArray(data?.chunk) ? data.chunk : []

  // Synapse's /messages endpoint strips m.relates_to from event content during serialization.
  // The /relations/{parentEventId} endpoint queries the event_relations table directly and
  // returns child events (replies) with full content. Use this to build a reverse mapping:
  // for each event in the chunk, find what it replies to by checking which parent's
  // /relations response includes it.
  //
  // Strategy: For each message event, call /relations/{eventId} to get its replies.
  // Build a map: replyEventId -> { parentEventId, parentSender, parentBody }
  // Then enrich each event with replyTo data from this map.

  const msgEvents = chunk.filter((ev) => ev?.type === 'm.room.message' && ev?.event_id)

  // Fetch relations for all message events in parallel (batch of /relations calls)
  const replyMap = new Map() // replyEventId -> { parentEventId, parentSender, parentBody }

  await Promise.all(
    msgEvents.map(async (parentEv) => {
      const parentId = parentEv.event_id
      const relationsUrl = `${baseUrl}/_matrix/client/v1/rooms/${encodedRoomId}/relations/${encodeURIComponent(parentId)}?limit=100`
      try {
        const relRes = await fetch(relationsUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        })
        if (!relRes.ok) {
          console.warn('[getOlderMessages] /relations failed:', { parentId, status: relRes.status })
          return
        }
        const relData = await relRes.json()
        const relChunk = Array.isArray(relData?.chunk) ? relData.chunk : []
        if (relChunk.length > 0) {
          console.warn('[getOlderMessages] /relations found children:', {
            parentId,
            childCount: relChunk.length,
            childIds: relChunk.map((c) => c.event_id),
          })
        }
        for (const childEv of relChunk) {
          if (childEv?.event_id && childEv?.type === 'm.room.message') {
            replyMap.set(childEv.event_id, {
              parentEventId: parentId,
              parentSender: parentEv.sender || '',
              parentBody: parentEv.content?.['m.new_content']?.body || parentEv.content?.body || '',
            })
          }
        }
      } catch (err) {
        console.warn('[getOlderMessages] /relations error:', { parentId, error: err?.message })
      }
    })
  )

  // Build lookup map of all events in chunk for resolving sender/body
  const eventMap = new Map()
  for (const ev of chunk) {
    if (ev && ev.event_id) {
      eventMap.set(ev.event_id, ev)
    }
  }

  // Enrich events with replyTo data from the replyMap (built via /relations endpoint).
  // Synapse strips m.relates_to from /messages responses, so we use the reverse mapping
  // from /relations/{parentEventId} to determine which events are replies.
  return chunk
    .filter((ev) => ev && ev.type === 'm.room.message' && ev.content)
    .map((ev) => {
      const newContent = ev.content?.['m.new_content']

      // Check if this event is a reply using the replyMap built from /relations calls
      const replyInfo = replyMap.get(ev.event_id)
      let replyToData = null
      if (replyInfo) {
        replyToData = {
          eventId: replyInfo.parentEventId,
          sender: replyInfo.parentSender,
          body: replyInfo.parentBody,
        }
      }

      return {
        eventId: ev.event_id,
        roomId: ev.room_id || roomId,
        sender: ev.sender,
        body: newContent?.body || ev.content?.body || '',
        originServerTs: ev.origin_server_ts || Date.now(),
        ...(replyToData ? { replyTo: replyToData } : {}),
        ...(ev.unsigned?.redacted_because ? { redacted: true } : {}),
        senderAvatarUrl: null,
      }
    })
}
