import { prisma } from '../db.js'
import * as spaceSync from '../lib/matrix/spaceSync.js'
import { getMatrixClient } from '../lib/matrix/client.js'

/**
 * Guild Profile Service - syncs guild and channel data with Matrix Spaces/Rooms,
 * handles invitations and member joining.
 */
export const guildProfileService = {
  /**
   * Get a guild profile by guildId.
   * @param {string} guildId - The guild ID
   * @returns {Promise<Object|null>} The guild profile, or null if not found
   */
  async getByGuildId(guildId) {
    return await prisma.guildProfile.findUnique({
      where: { guildId },
      include: { channels: true },
    })
  },

  /**
   * List all guilds accessible to the user (via Synapse joined_rooms or createdBy).
   * @param {object} params
   * @param {string} params.userId - Matrix user ID
   * @param {string} params.accessToken - Matrix access token
   * @returns {Promise<Array<object>>} List of guilds
   */
  async listGuilds({ userId, accessToken }) {
    let joinedRoomIds = []
    if (accessToken) {
      try {
        const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
        const res = await fetch(`${synapseUrl}/_matrix/client/v3/joined_rooms`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.ok) {
          const data = await res.json()
          joinedRoomIds = data.joined_rooms || []
        }
      } catch (err) {
        console.warn('[guildProfileService] Could not fetch joined rooms from Synapse:', err.message)
      }
    }

    const orConditions = []
    if (joinedRoomIds.length > 0) {
      orConditions.push({ guildId: { in: joinedRoomIds } })
      orConditions.push({ matrixSpaceId: { in: joinedRoomIds } })
    }
    if (userId) {
      orConditions.push({ createdBy: userId })
    }

    const guilds = await prisma.guildProfile.findMany({
      where: orConditions.length > 0 ? { OR: orConditions } : undefined,
      orderBy: { createdAt: 'asc' },
    })

    return guilds.map((g) => ({
      guildId: g.guildId,
      name: g.name || 'Guilda sem nome',
      avatarUrl: g.avatarUrl || null,
      bannerUrl: g.bannerUrl || null,
      description: g.description || g.topic || null,
      unreadCount: 0,
    }))
  },

  /**
   * Create or update a guild profile.
   * @param {object} data - Guild data
   * @returns {Promise<Object>}
   */
  async upsert(data) {
    const { guildId, ...rest } = data
    return await prisma.guildProfile.upsert({
      where: { guildId },
      update: rest,
      create: { guildId, ...rest },
    })
  },

  /**
   * Update a guild profile by guildId.
   * @param {string} guildId - The guild ID
   * @param {object} data - Fields to update
   * @returns {Promise<Object>}
   */
  async patch(guildId, data) {
    return await prisma.guildProfile.update({
      where: { guildId },
      data,
    })
  },

  /**
   * Create a new guild, create its Matrix Space, and create default #geral channel.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createGuild(data) {
    const { name, topic, description, iconUrl, avatarUrl, bannerUrl, isPrivate, maxMembers, createdBy, userId } = data
    const accessToken = data.accessToken
    const creator = createdBy || userId || 'system'
    const finalDesc = description || topic || null
    const finalAvatar = iconUrl || avatarUrl || null

    // 1. Create Matrix Space
    const spaceId = await spaceSync.createSpace(accessToken, name, finalDesc, finalAvatar, userId)

    // 2. Create default channel #geral in the space
    let defaultChannelId = spaceId
    try {
      defaultChannelId = await spaceSync.createRoom(
        accessToken,
        spaceId,
        'geral',
        'Canal geral de texto',
        undefined,
        userId
      )
    } catch (err) {
      console.warn('[guildProfileService] Could not create default channel room in Matrix:', err.message)
    }

    // 3. Upsert GuildProfile in DB
    const guild = await prisma.guildProfile.upsert({
      where: { guildId: spaceId },
      update: {
        matrixSpaceId: spaceId,
        name,
        description: finalDesc,
        topic: finalDesc,
        avatarUrl: finalAvatar,
        bannerUrl: bannerUrl || null,
        isPrivate: isPrivate || false,
        maxMembers,
        createdBy: creator,
        updatedAt: new Date(),
      },
      create: {
        guildId: spaceId,
        matrixSpaceId: spaceId,
        name,
        description: finalDesc,
        topic: finalDesc,
        avatarUrl: finalAvatar,
        bannerUrl: bannerUrl || null,
        isPrivate: isPrivate || false,
        maxMembers,
        createdBy: creator,
      },
    })

    // 4. Save default channel in ChannelProfile
    try {
      await prisma.channelProfile.create({
        data: {
          guildId: spaceId,
          matrixRoomId: defaultChannelId,
          name: 'geral',
          topic: 'Canal geral de texto',
          type: 'text',
          category: 'CANAIS DE TEXTO',
        },
      })
    } catch (err) {
      console.warn('[guildProfileService] Could not save default channel in DB:', err.message)
    }

    return {
      guildId: guild.guildId,
      name: guild.name || name,
      avatarUrl: guild.avatarUrl || null,
      unreadCount: 0,
    }
  },

  /**
   * Get all channels of a guild.
   * @param {string} guildId
   * @returns {Promise<Array<object>>}
   */
  async getChannels(guildId) {
    let channels = await prisma.channelProfile.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' },
    })

    // If guild has no channels registered yet, provision a default #geral channel
    if (channels.length === 0) {
      try {
        const created = await prisma.channelProfile.create({
          data: {
            guildId,
            matrixRoomId: guildId,
            name: 'geral',
            topic: 'Canal geral',
            type: 'text',
            category: 'CANAIS DE TEXTO',
          },
        })
        channels = [created]
      } catch (err) {
        console.warn('[guildProfileService] Error auto-creating default channel:', err.message)
      }
    }

    return channels.map((c) => ({
      channelId: c.matrixRoomId || c.id,
      id: c.id,
      name: c.name,
      topic: c.topic || '',
      type: c.type || 'text',
      category: c.category || (c.type === 'voice' ? 'CANAIS DE VOZ' : 'CANAIS DE TEXTO'),
      unreadCount: 0,
    }))
  },

  /**
   * Create a new channel within a guild and sync its Matrix Room.
   * @param {object} data - Channel data
   * @returns {Promise<object>} Created channel
   */
  async createChannel(data) {
    const { guildId, name, topic, type, category, userId } = data
    const accessToken = data.accessToken

    // Create Matrix Room as child of the guild's Space
    const roomId = await spaceSync.createRoom(accessToken, guildId, name, topic, undefined, userId)

    // Save in ChannelProfile DB
    const channel = await prisma.channelProfile.create({
      data: {
        guildId,
        matrixRoomId: roomId,
        name,
        topic: topic || null,
        type: type || 'text',
        category: category || (type === 'voice' ? 'CANAIS DE VOZ' : 'CANAIS DE TEXTO'),
      },
    })

    return {
      channelId: channel.matrixRoomId,
      name: channel.name,
      topic: channel.topic || '',
      type: channel.type,
      category: channel.category,
      unreadCount: 0,
    }
  },

  /**
   * Update a guild's Matrix Space settings.
   */
  async updateGuild(data) {
    const { guildId, topic, isPrivate, maxMembers, userId } = data
    const accessToken = data.accessToken

    await spaceSync.updateSpace(accessToken, guildId, undefined, topic, undefined, userId)

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
   */
  async updateChannel(data) {
    const { guildId, channelId, topic, userId } = data
    const accessToken = data.accessToken

    await spaceSync.updateRoom(accessToken, channelId || guildId, undefined, topic, undefined, userId)

    const channel = await prisma.channelProfile.upsert({
      where: { matrixRoomId: channelId },
      update: {
        topic,
        updatedAt: new Date(),
      },
      create: {
        guildId,
        matrixRoomId: channelId,
        name: channelId,
        topic,
        type: 'text',
      },
    })

    return channel
  },

  /**
   * Delete a guild and leave its Matrix Space.
   */
  async deleteGuild(data) {
    const { guildId, userId } = data
    const accessToken = data.accessToken

    await prisma.channelProfile.deleteMany({ where: { guildId } })
    await prisma.guildInvite.deleteMany({ where: { guildId } })
    await spaceSync.deleteSpace(accessToken, guildId, userId)
    await prisma.guildProfile.delete({ where: { guildId } })

    return { guildId }
  },

  /**
   * Leave a guild (leave space & child channels).
   */
  async leaveGuild({ guildId, accessToken, userId }) {
    const client = getMatrixClient(userId || '', accessToken)
    const channels = await prisma.channelProfile.findMany({ where: { guildId } })
    for (const ch of channels) {
      try {
        if (client.leaveRoom) await client.leaveRoom(ch.matrixRoomId)
        else if (client.leave) await client.leave(ch.matrixRoomId)
      } catch {
        // Continue
      }
    }
    try {
      if (client.leaveRoom) await client.leaveRoom(guildId)
      else if (client.leave) await client.leave(guildId)
    } catch {
      // Continue
    }
    return { success: true, guildId }
  },

  /**
   * Create an invitation link/code for a guild.
   */
  async createInvite({ guildId, creatorId, maxUses, expiresInHours }) {
    const code = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6)
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null

    const invite = await prisma.guildInvite.create({
      data: {
        code,
        guildId,
        creatorId,
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        expiresAt,
      },
    })

    return {
      code: invite.code,
      url: `https://echo.litteris.online/invite/${invite.code}`,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      expiresAt: invite.expiresAt,
    }
  },

  /**
   * Get public invite preview.
   */
  async getInvitePreview(code) {
    const invite = await prisma.guildInvite.findUnique({
      where: { code },
      include: {
        guild: {
          include: { channels: true },
        },
      },
    })

    if (!invite) {
      return { error: 'Convite não encontrado ou inválido', status: 404 }
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return { error: 'Este convite expirou', status: 410 }
    }

    if (invite.maxUses && invite.usesCount >= invite.maxUses) {
      return { error: 'Este convite atingiu o limite máximo de usos', status: 410 }
    }

    return {
      code: invite.code,
      guildId: invite.guildId,
      name: invite.guild?.name || 'Guilda Echo',
      description: invite.guild?.description || invite.guild?.topic || null,
      avatarUrl: invite.guild?.avatarUrl || null,
      bannerUrl: invite.guild?.bannerUrl || null,
      channelsCount: invite.guild?.channels?.length || 0,
      expiresAt: invite.expiresAt,
    }
  },

  /**
   * Join a guild using an invite code.
   */
  async joinGuildViaInvite({ code, userId, accessToken }) {
    const invite = await prisma.guildInvite.findUnique({
      where: { code },
      include: {
        guild: {
          include: { channels: true },
        },
      },
    })

    if (!invite) {
      return { error: 'Convite não encontrado ou inválido', status: 404 }
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return { error: 'Este convite expirou', status: 410 }
    }

    if (invite.maxUses && invite.usesCount >= invite.maxUses) {
      return { error: 'Este convite atingiu o limite de usos', status: 410 }
    }

    const client = getMatrixClient(userId || '', accessToken)

    // Join space
    try {
      if (client.joinRoom) {
        await client.joinRoom(invite.guildId)
      }
    } catch (err) {
      console.warn('[joinGuildViaInvite] Matrix join space error:', err.message)
    }

    // Join default channel
    if (invite.guild?.channels && invite.guild.channels.length > 0) {
      const defaultChannel = invite.guild.channels[0]
      try {
        if (client.joinRoom && defaultChannel.matrixRoomId) {
          await client.joinRoom(defaultChannel.matrixRoomId)
        }
      } catch (err) {
        console.warn('[joinGuildViaInvite] Matrix join channel error:', err.message)
      }
    }

    // Increment invite usage
    await prisma.guildInvite.update({
      where: { id: invite.id },
      data: { usesCount: { increment: 1 } },
    })

    return {
      success: true,
      guildId: invite.guildId,
      name: invite.guild?.name || 'Guilda',
    }
  },
}
