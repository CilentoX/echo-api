import { prisma } from '../db.js'
import * as spaceSync from '../lib/matrix/spaceSync.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Guild Profile Service - syncs guild data with Matrix Spaces/Rooms
 *
 * Consumes: getMatrixClient (via spaceSync), request.user.accessToken
 * Produces: guildProfileService.createGuild(data) → { guildId, matrixSpaceId }
 *           spaceSync.createSpace(accessToken, data) → spaceId
 */

export const guildProfileService = {
  /**
   * Create a new guild and sync its Matrix Space.
   * @param {object} data - Guild data { guildId, name, topic, isPrivate, maxMembers }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Created guild with matrixSpaceId
   */
  async createGuild(data) {
    const { guildId, name, topic, isPrivate, maxMembers } = data

    // Create Matrix Space first
    const accessToken = data.accessToken
    const spaceId = await spaceSync.createSpace(accessToken, name, topic)

    // Create or update GuildProfile in database
    const guild = await prisma.guildProfile.upsert({
      where: { guildId },
      update: {
        matrixSpaceId: spaceId,
        topic,
        isPrivate,
        maxMembers,
        updatedAt: new Date(),
      },
      create: {
        guildId,
        matrixSpaceId: spaceId,
        topic,
        isPrivate,
        maxMembers,
      },
    })

    return { guildId: guild.guildId, matrixSpaceId: guild.matrixSpaceId }
  },

  /**
   * Create a new channel within a guild and sync its Matrix Room.
   * @param {object} data - Channel data { guildId, channelId, name, topic, type, category }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Created channel profile
   */
  async createChannel(data) {
    const { guildId, channelId, name, topic, type, category } = data
    const accessToken = data.accessToken

    // Create Matrix Room as child of the guild's Space
    const roomId = await spaceSync.createRoom(accessToken, guildId, name, topic)

    // Create or update ChannelProfile in database
    const channel = await prisma.channelProfile.upsert({
      where: { id: channelId },
      update: {
        guildId,
        matrixRoomId: roomId,
        name,
        topic,
        type,
        category,
        updatedAt: new Date(),
      },
      create: {
        id: channelId,
        guildId,
        matrixRoomId: roomId,
        name,
        topic,
        type: type || 'text',
        category,
      },
    })

    return channel
  },

  /**
   * Update a guild's Matrix Space settings.
   * @param {object} data - Update data { guildId, topic, isPrivate, maxMembers }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Updated guild
   */
  async updateGuild(data) {
    const { guildId, topic, isPrivate, maxMembers } = data
    const accessToken = data.accessToken

    // Update Matrix Space
    await spaceSync.updateSpace(accessToken, guildId, undefined, topic)

    // Update GuildProfile in database
    const guild = await prisma.guildProfile.upsert({
      where: { guildId },
      update: {
        topic,
        isPrivate,
        maxMembers,
        updatedAt: new Date(),
      },
      create: {
        guildId,
        topic,
        isPrivate,
        maxMembers,
      },
    })

    return { guildId: guild.guildId, matrixSpaceId: guild.matrixSpaceId }
  },

  /**
   * Update a channel's Matrix Room settings.
   * @param {object} data - Update data { guildId, channelId, topic }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Updated channel profile
   */
  async updateChannel(data) {
    const { guildId, channelId, topic } = data
    const accessToken = data.accessToken

    // Update Matrix Room
    await spaceSync.updateRoom(accessToken, guildId, undefined, topic)

    // Update ChannelProfile in database
    const channel = await prisma.channelProfile.upsert({
      where: { id: channelId },
      update: {
        topic,
        updatedAt: new Date(),
      },
      create: {
        id: channelId,
        guildId,
        matrixRoomId: guildId, // fallback
        name: channelId,
        topic,
        type: 'text',
      },
    })

    return channel
  },

  /**
   * Delete a guild and its associated channels from Matrix.
   * @param {object} data - Delete data { guildId, accessToken }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Deleted guild info
   */
  async deleteGuild(data) {
    const { guildId } = data
    const accessToken = data.accessToken

    // Delete all channels in this guild
    await prisma.channelProfile.deleteMany({ where: { guildId } })

    // Leave and forget the Matrix Space
    await spaceSync.deleteSpace(accessToken, guildId)

    // Delete GuildProfile from database
    await prisma.guildProfile.delete({ where: { guildId } })

    return { guildId }
  },

  /**
   * Delete a channel from Matrix and database.
   * @param {object} data - Delete data { guildId, channelId, accessToken }
   * @param {string} data.accessToken - User's Matrix access token
   * @returns {Promise<object>} Deleted channel info
   */
  async deleteChannel(data) {
    const { guildId, channelId } = data
    const accessToken = data.accessToken

    // Leave and forget the Matrix Room
    await spaceSync.deleteRoom(accessToken, channelId)

    // Delete ChannelProfile from database
    await prisma.channelProfile.delete({ where: { id: channelId } })

    return { guildId, channelId }
  },
}