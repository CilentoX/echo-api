import { getMatrixClient } from './client.js'

/**
 * Creates a Matrix Space (m.space event) and returns the space (room) ID.
 * Calls Matrix client's createRoom with creation_content: { type: 'm.space' }.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} name - The space name
 * @param {string} [topic] - The space topic
 * @param {string} [avatar] - The space avatar URL
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<string>} The space ID (room ID)
 */
export async function createSpace(accessToken, name, topic, avatar, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  const createOptions = {
    visibility: 'private',
    preset: 'public_chat',
    name,
    topic: topic || undefined,
    creation_content: { type: 'm.space' },
    initial_state: [
      {
        type: 'm.room.join_rules',
        state_key: '',
        content: { join_rule: 'public' },
      },
      {
        type: 'm.room.history_visibility',
        state_key: '',
        content: { history_visibility: 'shared' },
      },
    ],
  }

  if (avatar) {
    createOptions.initial_state.push({
      type: 'm.room.avatar',
      state_key: '',
      content: { url: avatar },
    })
  }

  const result = await client.createRoom(createOptions)
  return typeof result === 'string' ? result : (result?.room_id || result?.roomId)
}

/**
 * Updates a Matrix Space by sending m.room state events.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The space ID (room ID)
 * @param {string} [name] - The new space name
 * @param {string} [topic] - The new space topic
 * @param {string} [avatar] - The new space avatar URL
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<void>}
 */
export async function updateSpace(accessToken, spaceId, name, topic, avatar, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  const stateEvents = []

  if (name) {
    stateEvents.push({
      type: 'm.room.name',
      state_key: '',
      content: { name },
    })
  }
  if (topic) {
    stateEvents.push({
      type: 'm.room.topic',
      state_key: '',
      content: { topic },
    })
  }
  if (avatar) {
    stateEvents.push({
      type: 'm.room.avatar',
      state_key: '',
      content: { url: avatar },
    })
  }

  if (client.setRoomState) {
    await client.setRoomState(stateEvents, spaceId)
  }
}

/**
 * Deletes a Matrix Space by leaving and forgetting the room.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The space ID (room ID) to delete
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<void>}
 */
export async function deleteSpace(accessToken, spaceId, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  if (client.leaveRoom) {
    await client.leaveRoom(spaceId)
  } else if (client.leave) {
    await client.leave(spaceId)
  }

  if (client.forgetRoom) {
    await client.forgetRoom(spaceId)
  } else if (client.forget) {
    await client.forget(spaceId)
  }
}

/**
 * Creates a child room within a Matrix Space.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The parent space ID
 * @param {string} name - The child room name
 * @param {string} [topic] - The child room topic
 * @param {string} [avatar] - The child room avatar URL
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<string>} The child room ID
 */
export async function createRoom(accessToken, spaceId, name, topic, avatar, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  const createOptions = {
    visibility: 'private',
    preset: 'public_chat',
    name,
    topic: topic || undefined,
    initial_state: [
      {
        type: 'm.room.join_rules',
        state_key: '',
        content: { join_rule: 'public' },
      },
      {
        type: 'm.room.history_visibility',
        state_key: '',
        content: { history_visibility: 'shared' },
      },
    ],
  }

  if (avatar) {
    createOptions.initial_state.push({
      type: 'm.room.avatar',
      state_key: '',
      content: { url: avatar },
    })
  }

  const result = await client.createRoom(createOptions)
  const roomId = typeof result === 'string' ? result : (result?.room_id || result?.roomId)

  // Link child room to parent space if supported
  if (client.sendStateEvent && spaceId && roomId) {
    const serverName = process.env.SYNAPSE_SERVER_NAME || 'litteris.online'
    try {
      await client.sendStateEvent(spaceId, 'm.space.child', { via: [serverName] }, roomId)
      await client.sendStateEvent(roomId, 'm.space.parent', { via: [serverName], canonical: true }, spaceId)
    } catch {
      // Best-effort linking
    }
  }

  return roomId
}

/**
 * Updates a child room within a Matrix Space.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} roomId - The child room ID
 * @param {string} [name] - The new room name
 * @param {string} [topic] - The new room topic
 * @param {string} [avatar] - The new room avatar URL
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<void>}
 */
export async function updateRoom(accessToken, roomId, name, topic, avatar, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  const stateEvents = []

  if (name) {
    stateEvents.push({
      type: 'm.room.name',
      state_key: '',
      content: { name },
    })
  }
  if (topic) {
    stateEvents.push({
      type: 'm.room.topic',
      state_key: '',
      content: { topic },
    })
  }
  if (avatar) {
    stateEvents.push({
      type: 'm.room.avatar',
      state_key: '',
      content: { url: avatar },
    })
  }

  if (client.setRoomState) {
    await client.setRoomState(stateEvents, roomId)
  }
}

/**
 * Deletes a child room within a Matrix Space.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} roomId - The child room ID to delete
 * @param {string} [userId=''] - Matrix user ID
 * @returns {Promise<void>}
 */
export async function deleteRoom(accessToken, roomId, userId = '') {
  const client = getMatrixClient(userId, accessToken)

  if (client.leaveRoom) {
    await client.leaveRoom(roomId)
  } else if (client.leave) {
    await client.leave(roomId)
  }

  if (client.forgetRoom) {
    await client.forgetRoom(roomId)
  } else if (client.forget) {
    await client.forget(roomId)
  }
}
