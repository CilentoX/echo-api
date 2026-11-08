import { authenticate } from '../plugins/auth.js'

/**
 * Estrutura em memória para estado de salas de voz e sinalização WebRTC.
 * channelVoiceState: Map<channelId, Map<userId, ParticipantData>>
 * signalQueues: Map<targetUserId, Array<{ fromUserId: string, channelId: string, signal: any, timestamp: number }>>
 */
const channelVoiceState = new Map()
const signalQueues = new Map()

const HEARTBEAT_TIMEOUT_MS = 10000 // 10s sem heartbeat remove o participante (heartbeat cliente a cada 2s)

function normalizeChannelId(id) {
  if (!id) return ''
  try {
    return decodeURIComponent(id).trim()
  } catch {
    return String(id).trim()
  }
}

function pruneStaleParticipants(channelId) {
  const normId = normalizeChannelId(channelId)
  const channel = channelVoiceState.get(normId)
  if (!channel) return
  const now = Date.now()
  for (const [userId, participant] of channel.entries()) {
    if (now - participant.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      channel.delete(userId)
    }
  }
  if (channel.size === 0) {
    channelVoiceState.delete(normId)
  }
}

function pruneAllStaleParticipants() {
  const now = Date.now()
  for (const [channelId, channel] of channelVoiceState.entries()) {
    for (const [userId, participant] of channel.entries()) {
      if (now - participant.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        channel.delete(userId)
      }
    }
    if (channel.size === 0) {
      channelVoiceState.delete(channelId)
    }
  }
}

// Limpeza periódica em segundo plano para canais inativos
const backgroundPruner = setInterval(pruneAllStaleParticipants, 4000)
if (typeof backgroundPruner.unref === 'function') {
  backgroundPruner.unref()
}

function removeUserFromAllChannels(userId) {
  for (const [channelId, channel] of channelVoiceState.entries()) {
    if (channel.has(userId)) {
      channel.delete(userId)
      if (channel.size === 0) {
        channelVoiceState.delete(channelId)
      }
    }
  }
}

export function registerVoiceRoutes(app) {
  /**
   * POST /api/channels/:channelId/voice/join
   * Entra em uma sala de voz.
   */
  app.post(
    '/api/channels/:channelId/voice/join',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const userId = request.user.userId
      const { guildId, username, avatarUrl, isMuted, isDeafened, isScreenSharing, hasCamera } = request.body || {}

      if (!channelId) {
        return reply.code(400).send({ error: 'channelId é obrigatório' })
      }

      // Remove de outros canais anteriores
      removeUserFromAllChannels(userId)

      if (!channelVoiceState.has(channelId)) {
        channelVoiceState.set(channelId, new Map())
      }

      const channel = channelVoiceState.get(channelId)
      channel.set(userId, {
        userId,
        username: username || userId.replace(/^@/, '').split(':')[0],
        avatarUrl: avatarUrl || null,
        guildId: guildId ? normalizeChannelId(guildId) : null,
        isMuted: Boolean(isMuted),
        isDeafened: Boolean(isDeafened),
        isSpeaking: false,
        isScreenSharing: Boolean(isScreenSharing),
        hasCamera: Boolean(hasCamera),
        lastHeartbeat: Date.now(),
      })

      pruneStaleParticipants(channelId)

      const participants = Array.from(channel.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl,
        isMuted: p.isMuted,
        isDeafened: p.isDeafened,
        isSpeaking: p.isSpeaking,
        isScreenSharing: Boolean(p.isScreenSharing),
        hasCamera: Boolean(p.hasCamera),
      }))

      return reply.code(200).send({ success: true, channelId, myUserId: userId, participants })
    }
  )

  /**
   * POST /api/channels/:channelId/voice/heartbeat
   * Atualiza keep-alive e status de fala/mudo do participante.
   */
  app.post(
    '/api/channels/:channelId/voice/heartbeat',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const userId = request.user.userId
      const { isSpeaking, isMuted, isDeafened, isScreenSharing, hasCamera, guildId, username, avatarUrl } = request.body || {}

      pruneStaleParticipants(channelId)

      let channel = channelVoiceState.get(channelId)
      if (!channel || !channel.has(userId)) {
        if (!channel) {
          channel = new Map()
          channelVoiceState.set(channelId, channel)
        }
        channel.set(userId, {
          userId,
          username: username || userId.replace(/^@/, '').split(':')[0],
          avatarUrl: avatarUrl || null,
          guildId: guildId ? normalizeChannelId(guildId) : null,
          isMuted: Boolean(isMuted),
          isDeafened: Boolean(isDeafened),
          isSpeaking: Boolean(isSpeaking),
          isScreenSharing: Boolean(isScreenSharing),
          hasCamera: Boolean(hasCamera),
          lastHeartbeat: Date.now(),
        })
      } else {
        const participant = channel.get(userId)
        participant.lastHeartbeat = Date.now()
        if (typeof isSpeaking === 'boolean') participant.isSpeaking = isSpeaking
        if (typeof isMuted === 'boolean') participant.isMuted = isMuted
        if (typeof isDeafened === 'boolean') participant.isDeafened = isDeafened
        if (typeof isScreenSharing === 'boolean') participant.isScreenSharing = isScreenSharing
        if (typeof hasCamera === 'boolean') participant.hasCamera = hasCamera
        if (guildId && !participant.guildId) participant.guildId = normalizeChannelId(guildId)
        if (username && participant.username === userId.replace(/^@/, '').split(':')[0]) participant.username = username
        if (avatarUrl && !participant.avatarUrl) participant.avatarUrl = avatarUrl
      }

      const participants = Array.from(channel.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl,
        isMuted: p.isMuted,
        isDeafened: p.isDeafened,
        isSpeaking: p.isSpeaking,
        isScreenSharing: Boolean(p.isScreenSharing),
        hasCamera: Boolean(p.hasCamera),
      }))

      return reply.code(200).send({ channelId, myUserId: userId, participants })
    }
  )

  /**
   * POST /api/channels/:channelId/voice/leave
   * Sai da sala de voz.
   */
  app.post(
    '/api/channels/:channelId/voice/leave',
    { preHandler: authenticate },
    async (request, reply) => {
      const rawChannelId = request.params.channelId
      const channelId = rawChannelId ? normalizeChannelId(rawChannelId) : null
      const userId = request.user.userId

      if (channelId && channelId !== 'current') {
        const channel = channelVoiceState.get(channelId)
        if (channel) {
          channel.delete(userId)
          if (channel.size === 0) channelVoiceState.delete(channelId)
        }
      } else {
        removeUserFromAllChannels(userId)
      }

      return reply.code(200).send({ success: true })
    }
  )

  /**
   * POST /api/voice/leave
   * Sai de todas as salas de voz (logout, boot/inicialização ou cleanup).
   */
  app.post(
    '/api/voice/leave',
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.user.userId
      removeUserFromAllChannels(userId)
      return reply.code(200).send({ success: true })
    }
  )

  /**
   * GET /api/guilds/:guildId/voice/state
   * Retorna os participantes ativos de voz para todos os canais de uma guilda.
   */
  app.get(
    '/api/guilds/:guildId/voice/state',
    { preHandler: authenticate },
    async (request, reply) => {
      const rawGuildId = request.params.guildId
      const guildId = rawGuildId ? normalizeChannelId(rawGuildId) : ''
      const channels = {}

      pruneAllStaleParticipants()

      for (const [chId, channel] of channelVoiceState.entries()) {
        const participants = []
        for (const p of channel.values()) {
          if (!guildId || p.guildId === guildId || !p.guildId) {
            participants.push({
              userId: p.userId,
              username: p.username,
              avatarUrl: p.avatarUrl,
              isMuted: p.isMuted,
              isDeafened: p.isDeafened,
              isSpeaking: p.isSpeaking,
              isScreenSharing: Boolean(p.isScreenSharing),
              hasCamera: Boolean(p.hasCamera),
            })
          }
        }
        if (participants.length > 0) {
          channels[chId] = participants
        }
      }

      return reply.code(200).send({ guildId, channels })
    }
  )

  /**
   * POST /api/channels/:channelId/voice/signal
   * Envia uma mensagem de sinalização WebRTC (offer, answer, ICE candidate).
   */
  app.post(
    '/api/channels/:channelId/voice/signal',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const fromUserId = request.user.userId
      const { targetUserId, signal } = request.body || {}

      if (!targetUserId || !signal) {
        return reply.code(400).send({ error: 'targetUserId e signal são obrigatórios' })
      }

      if (!signalQueues.has(targetUserId)) {
        signalQueues.set(targetUserId, [])
      }

      const queue = signalQueues.get(targetUserId)
      queue.push({
        fromUserId,
        channelId,
        signal,
        timestamp: Date.now(),
      })

      // Limita fila a 50 sinais para evitar vazamento
      if (queue.length > 50) {
        queue.splice(0, queue.length - 50)
      }

      return reply.code(200).send({ success: true })
    }
  )

  /**
   * GET /api/channels/:channelId/voice/signals
   * Recupera e consome os sinais WebRTC destinados ao usuário atual.
   */
  app.get(
    '/api/channels/:channelId/voice/signals',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const myUserId = request.user.userId

      const now = Date.now()
      const rawQueue = (signalQueues.get(myUserId) || []).filter((s) => now - s.timestamp < 45000)
      // Filtra sinais para este canal ou gerais
      const relevant = rawQueue.filter((s) => !channelId || s.channelId === channelId)
      // Mantém os que não são para este canal
      const remaining = rawQueue.filter((s) => channelId && s.channelId !== channelId)

      if (remaining.length > 0) {
        signalQueues.set(myUserId, remaining)
      } else {
        signalQueues.delete(myUserId)
      }

      return reply.code(200).send({ signals: relevant })
    }
  )
}

