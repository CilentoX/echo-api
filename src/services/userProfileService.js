import { prisma } from '../db.js'
import { syncDisplayNameToMatrix, syncAvatarUrlToMatrix } from '../lib/matrix/profileSync.js'

/**
 * Validates a username string.
 * - Must be 3-32 characters, lowercase alphanumeric, underscore, dot or hyphen.
 *
 * @param {string} username - The username to validate
 * @returns {boolean} true if the username is valid
 */
export function isValidUsername(username) {
  if (username === undefined || username === null) {
    return true
  }

  if (typeof username !== 'string') {
    return false
  }

  const clean = username.trim().toLowerCase()
  if (clean.length < 3 || clean.length > 32) {
    return false
  }

  return /^[a-z0-9_.-]+$/.test(clean)
}

/**
 * Checks if a username is available.
 *
 * @param {string} username - The username to check
 * @param {string} [excludeUserId] - User ID to exclude from check (for the user's current username)
 * @returns {Promise<{ available: boolean, username?: string, error?: string }>}
 */
export async function isUsernameAvailable(username, excludeUserId = null) {
  if (!username || typeof username !== 'string') {
    return { available: false, error: 'Username não informado' }
  }

  const clean = username.trim().toLowerCase()
  if (!isValidUsername(clean)) {
    return {
      available: false,
      error: 'Username deve ter de 3 a 32 caracteres (apenas letras minúsculas, números, _, . ou -)',
    }
  }

  const where = { username: clean }
  if (excludeUserId) {
    where.NOT = { userId: excludeUserId }
  }

  const existing = await prisma.userProfile.findFirst({ where })
  if (existing) {
    return { available: false, error: 'Este username já está em uso' }
  }

  return { available: true, username: clean }
}

/**
 * Validates a nickname string.
 * - Must be 1-32 characters if provided
 * - Must not contain control characters
 *
 * @param {string} nickname - The nickname to validate
 * @returns {boolean} true if the nickname is valid
 */
export function isValidNickname(nickname) {
  if (nickname === undefined || nickname === null) {
    return true // nickname is optional
  }

  if (typeof nickname !== 'string') {
    return false
  }

  // Check length (1-32 characters)
  if (nickname.length < 1 || nickname.length > 32) {
    return false
  }

  // Check for control characters (ASCII 0-31, except tab 9, newline 10, carriage return 13)
  // Allow printable ASCII and Unicode
  for (let i = 0; i < nickname.length; i++) {
    const code = nickname.charCodeAt(i)
    // Control characters: 0-31 (except tab 9, newline 10, CR 13)
    // Also exclude DEL (127)
    if (code <= 31 || code === 127) {
      return false
    }
  }

  return true
}

/**
 * Gets the nickname from a UserProfile.
 * @param {Object} profile - The UserProfile object from Prisma
 * @returns {string|null} The nickname, or null if not set
 */
export function getNicknameFromProfile(profile) {
  return profile.nickname || null
}

/**
 * Sets the nickname for a user.
 * Updates the database and syncs the display name to Matrix.
 *
 * @param {string} userId - The user's Matrix user ID (e.g. "@user:domain")
 * @param {string} nickname - The nickname to set (1-32 chars, no control chars)
 * @returns {Promise<Object>} The updated UserProfile from the database
 * @throws {Error} If the nickname is invalid or the update fails
 */
export async function setNickname(userId, nickname) {
  // Validate the nickname
  if (!isValidNickname(nickname)) {
    throw new Error(
      'Invalid nickname: must be 1-32 characters and contain no control characters'
    )
  }

  // Update the nickname in the database
  const updatedProfile = await prisma.userProfile.upsert({
    where: { userId },
    update: {
      nickname,
    },
    create: {
      userId,
      nickname,
    },
  })

  return updatedProfile
}

/**
 * Gets the nickname for a user.
 * @param {string} userId - The user's Matrix user ID (e.g. "@user:domain")
 * @returns {Promise<string|null>} The nickname, or null if not found
 */
export async function getNickname(userId) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })

  if (!profile) {
    return null
  }

  return getNicknameFromProfile(profile)
}

/**
 * Gets the complete UserProfile for a user.
 * @param {string} userId - The user's Matrix user ID
 * @returns {Promise<Object|null>} The UserProfile record, or null if not found
 */
export async function getProfile(userId) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  })

  return profile || null
}

/**
 * Updates a user's profile with partial or complete fields.
 *
 * @param {string} userId - The user's Matrix user ID
 * @param {Object} data - Profile fields ({ nickname, avatarUrl, bannerUrl, bio, links })
 * @param {string} [accessToken] - Matrix access token for syncing display name
 * @returns {Promise<Object>} The updated UserProfile
 */
export async function updateProfile(userId, data = {}, accessToken = null) {
  const { avatarUrl, bannerUrl, bio, links } = data
  const nickname = data.nickname !== undefined ? data.nickname : data.displayName
  const username = data.username !== undefined ? (typeof data.username === 'string' ? data.username.trim().toLowerCase() : null) : undefined

  if (nickname !== undefined && !isValidNickname(nickname)) {
    throw new Error(
      'Invalid nickname: must be 1-32 characters and contain no control characters'
    )
  }

  const updateData = {}
  if (nickname !== undefined) updateData.nickname = nickname
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
  if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl
  if (bio !== undefined) updateData.bio = bio
  if (links !== undefined) updateData.links = links

  if (username !== undefined && username !== null && username !== '') {
    if (!isValidUsername(username)) {
      throw new Error(
        'Username inválido: use 3 a 32 caracteres (letras, números, _ ou .)'
      )
    }
    const existing = await prisma.userProfile.findFirst({
      where: {
        username,
        NOT: { userId },
      },
    })
    if (existing) {
      throw new Error('Este username já está em uso')
    }
    updateData.username = username
  } else if (username === '') {
    updateData.username = null
  }

  const updatedProfile = await prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      ...updateData,
    },
  })

  if (nickname !== undefined && accessToken) {
    try {
      await syncDisplayNameToMatrix(userId, accessToken, nickname)
    } catch (err) {
      console.error('[userProfileService] Error syncing display name to Matrix:', err)
    }
  }

  if (avatarUrl !== undefined && accessToken) {
    try {
      await syncAvatarUrlToMatrix(userId, accessToken, avatarUrl)
    } catch (err) {
      console.error('[userProfileService] Error syncing avatar URL to Matrix:', err)
    }
  }

  return updatedProfile
}

/**
 * Sets the nickname and syncs to Matrix.
 * This is a convenience function that both updates the DB
 * and syncs the display name to Matrix using the provided access token.
 *
 * @param {string} userId - The user's Matrix user ID
 * @param {string} accessToken - The user's Matrix access token
 * @param {string} nickname - The nickname to set
 * @returns {Promise<Object>} The updated UserProfile from the database
 */
export async function setNicknameWithSync(userId, accessToken, nickname) {
  // Update the database
  const updatedProfile = await setNickname(userId, nickname)

  // Sync to Matrix display name
  await syncDisplayNameToMatrix(userId, accessToken, nickname)

  return updatedProfile
}

/**
 * Deletes a user profile and saved tokens from the database.
 * @param {string} userId - The user's Matrix user ID
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteProfile(userId) {
  try {
    await prisma.userProfile.deleteMany({
      where: { userId },
    })
  } catch (err) {
    console.warn('[userProfileService] Error deleting userProfile:', err)
  }
  try {
    await prisma.userToken.deleteMany({
      where: { userId },
    })
  } catch (err) {
    console.warn('[userProfileService] Error deleting userToken:', err)
  }
  return { success: true }
}
