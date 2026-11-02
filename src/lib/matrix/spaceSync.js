import { getMatrixClient } from './client.js'

/**
 * Creates a Matrix Space (m.space event) and returns the space (room) ID.
 * Calls Matrix client's createRoom with space preset.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} name - The space name
 * @param {string} [topic] - The space topic
 * @param {string} [avatar] - The space avatar URL
 * @returns {Promise<string>} The space ID (room ID)
 */
export async function createSpace(accessToken, name, topic, avatar) {
  const client = getMatrixClient('', accessToken)

  // Create the space using m.space.create event
  const createEvent = {
    type: 'm.room.create',
    state_key: '',
    content: {
      type: 'm.space',
      name,
    },
  }

  if (topic) {
    createEvent.content.topic = topic
  }
  if (avatar) {
    createEvent.content.avatar_url = avatar
  }

  // Create a room with private_chat preset which generates m.space event
  const roomId = await client.createRoom({
    visibility: 'private',
    preset: 'private_chat',
    initialState: [createEvent],
    name,
  })

  return roomId
}

/**
 * Updates a Matrix Space by sending m.space state event.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The space ID (room ID)
 * @param {string} [name] - The new space name
 * @param {string} [topic] - The new space topic
 * @param {string} [avatar] - The new space avatar URL
 * @returns {Promise<void>}
 */
export async function updateSpace(accessToken, spaceId, name, topic, avatar) {
  const client = getMatrixClient('', accessToken)

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
      type: 'm.space.topic',
      state_key: '',
      content: { topic },
    })
  }
  if (avatar) {
    stateEvents.push({
      type: 'm.space.avatar',
      state_key: '',
      content: { avatar_url: avatar },
    })
  }

  await client.setRoomState(stateEvents, spaceId)
}

/**
 * Deletes a Matrix Space by leaving and forgetting the room.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The space ID (room ID) to delete
 * @returns {Promise<void>}
 */
export async function deleteSpace(accessToken, spaceId) {
  const client = getMatrixClient('', accessToken)

  await client.leaveRoom(spaceId)
  await client.forgetRoom(spaceId)
}

/**
 * Creates a child room within a Matrix Space.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} spaceId - The parent space ID
 * @param {string} name - The child room name
 * @param {string} [topic] - The child room topic
 * @param {string} [avatar] - The child room avatar URL
 * @returns {Promise<string>} The child room ID
 */
export async function createRoom(accessToken, spaceId, name, topic, avatar) {
  const client = getMatrixClient('', accessToken)

  const createEvent = {
    type: 'm.room.create',
    state_key: '',
    content: {
      type: 'm.room.create',
    },
  }

  if (topic) {
    createEvent.content.topic = topic
  }
  if (avatar) {
    createEvent.content.avatar_url = avatar
  }

  // Add m.space.child state event to make this room a child of the space
  const spaceChildEvent = {
    type: 'm.space.child',
    state_key: '',
    content: {
      name,
    },
  }

  if (topic) {
    spaceChildEvent.content.topic = topic
  }
  if (avatar) {
    spaceChildEvent.content.avatar_url = avatar
  }

  const roomId = await client.createRoom({
    visibility: 'private',
    preset: 'private_chat',
    initialState: [createEvent, spaceChildEvent],
    name,
  })

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
 * @returns {Promise<void>}
 */
export async function updateRoom(accessToken, roomId, name, topic, avatar) {
  const client = getMatrixClient('', accessToken)

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
      content: { avatar_url: avatar },
    })
  }

  // Also update the m.space.child event if the room is a child of a space
  await client.setRoomState(stateEvents, roomId)
}

/**
 * Deletes a child room within a Matrix Space.
 *
 * @param {string} accessToken - The user's access token for Matrix authentication
 * @param {string} roomId - The child room ID to delete
 * @returns {Promise<void>}
 */
export async function deleteRoom(accessToken, roomId) {
  const client = getMatrixClient('', accessToken)

  await client.leaveRoom(roomId)
  await client.forgetRoom(roomId)
}