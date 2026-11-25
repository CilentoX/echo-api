import { AccessToken, WebhookReceiver } from 'livekit-server-sdk'
import { authenticate } from '../plugins/auth.js'

/**
 * Estrutura em memória para estado de salas de voz e sinalização WebRTC.
 * channelVoiceState: Map<channelId, Map<userId, ParticipantData>>
 * signalQueues: Map<targetUserId, Array<{ fromUserId: string, channelId: string, signal: any, timestamp: number }>>
 * channelSseClients: Map<channelId, Map<userId, { reply, request, keepaliveInterval }>>
 */
const channelVoiceState = new Map()
const signalQueues = new Map()
const channelSseClients = new Map()
const guildSseClients = new Map()

const HEARTBEAT_TIMEOUT_MS = 10000 // 10s sem heartbeat remove o participante (heartbeat cliente a cada 2s)

function normalizeChannelId(id) {
  if (!id) return ''
  try {
    return decodeURIComponent(id).trim()
  } catch {
    return String(id).trim()
  }
}

/**
 * Transmite evento em tempo real via Server-Sent Events (SSE) para todos os clientes do canal.
 */
function broadcastChannelEvent(channelId, eventName, data, excludeUserId = null) {
  const normId = normalizeChannelId(channelId)
  const clients = channelSseClients.get(normId)
  if (!clients) return
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [userId, client] of clients.entries()) {
    if (excludeUserId && userId === excludeUserId) continue
    try {
      client.reply.raw.write(payload)
    } catch {
      clients.delete(userId)
    }
  }
}

/**
 * Envia evento instantâneo via SSE diretamente ao usuário de destino (<20ms).
 */
function sendUserEvent(targetUserId, eventName, data) {
  let delivered = false
  const targetNorm = targetUserId ? String(targetUserId).toLowerCase() : ''
  for (const clients of channelSseClients.values()) {
    let client = clients.get(targetUserId)
    if (!client && targetNorm) {
      for (const [uid, c] of clients.entries()) {
        if (String(uid).toLowerCase() === targetNorm) {
          client = c
          break
        }
      }
    }
    if (client) {
      try {
        client.reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
        delivered = true
      } catch {
        clients.delete(targetUserId)
      }
    }
  }
  return delivered
}

function pruneStaleParticipants(channelId) {
  const normId = normalizeChannelId(channelId)
  const channel = channelVoiceState.get(normId)
  if (!channel) return
  const now = Date.now()
  let modified = false
  let guildId = null
  for (const [userId, participant] of channel.entries()) {
    if (now - participant.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      if (participant.guildId) guildId = participant.guildId
      channel.delete(userId)
      modified = true
    }
  }
  if (channel.size === 0) {
    channelVoiceState.delete(normId)
  }
  if (modified && guildId) {
    broadcastGuildVoiceState(guildId)
  }
}

function pruneAllStaleParticipants() {
  const now = Date.now()
  const affectedGuilds = new Set()
  const affectedChannels = new Set()

  for (const [channelId, channel] of channelVoiceState.entries()) {
    for (const [userId, participant] of channel.entries()) {
      if (now - participant.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        if (participant.guildId) affectedGuilds.add(participant.guildId)
        affectedChannels.add(channelId)
        channel.delete(userId)
        broadcastChannelEvent(channelId, 'participant_left', { userId, channelId })
      }
    }
    if (channel.size === 0) {
      channelVoiceState.delete(channelId)
    }
  }

  for (const chId of affectedChannels) {
    const ch = channelVoiceState.get(chId)
    const remaining = ch
      ? Array.from(ch.values()).map((p) => ({
          userId: p.userId,
          username: p.username,
          avatarUrl: p.avatarUrl,
          isMuted: p.isMuted,
          isDeafened: p.isDeafened,
          isSpeaking: p.isSpeaking,
          isScreenSharing: Boolean(p.isScreenSharing),
          hasCamera: Boolean(p.hasCamera),
        }))
      : []
    broadcastChannelEvent(chId, 'participants', remaining)
  }

  for (const gId of affectedGuilds) {
    broadcastGuildVoiceState(gId)
  }
}

// Limpeza periódica em segundo plano para canais inativos
const backgroundPruner = setInterval(pruneAllStaleParticipants, 4000)
if (typeof backgroundPruner.unref === 'function') {
  backgroundPruner.unref()
}

/**
 * Coleta snapshot de canais com participantes ativos para uma guilda.
 */
function getGuildVoiceStateData(guildId) {
  const normGuildId = guildId ? normalizeChannelId(guildId) : ''
  const channels = {}

  for (const [chId, channel] of channelVoiceState.entries()) {
    const participants = []
    for (const p of channel.values()) {
      if (!normGuildId || p.guildId === normGuildId || !p.guildId) {
        const isUserMuted = Boolean(p.isMuted || p.isDeafened)
        participants.push({
          userId: p.userId,
          username: p.username,
          avatarUrl: p.avatarUrl,
          isMuted: Boolean(p.isMuted),
          isDeafened: Boolean(p.isDeafened),
          isSpeaking: isUserMuted ? false : Boolean(p.isSpeaking),
          isScreenSharing: Boolean(p.isScreenSharing),
          hasCamera: Boolean(p.hasCamera),
        })
      }
    }
    if (participants.length > 0) {
      channels[chId] = participants
    }
  }

  return { guildId: normGuildId, channels }
}

/**
 * Transmite o snapshot atualizado de voz da guilda para todos os ouvintes via SSE.
 */
function broadcastGuildVoiceState(guildId) {
  if (!guildId) return
  const normGuildId = normalizeChannelId(guildId)
  const clients = guildSseClients.get(normGuildId)
  if (!clients || clients.size === 0) return

  const data = getGuildVoiceStateData(normGuildId)
  const payload = `event: voice_state\ndata: ${JSON.stringify(data)}\n\n`

  for (const [userId, client] of clients.entries()) {
    try {
      client.reply.raw.write(payload)
    } catch {
      clients.delete(userId)
    }
  }
}

function removeUserFromAllChannels(userId) {
  const affectedGuilds = new Set()
  for (const [channelId, channel] of channelVoiceState.entries()) {
    if (channel.has(userId)) {
      const p = channel.get(userId)
      if (p?.guildId) affectedGuilds.add(p.guildId)
      channel.delete(userId)
      if (channel.size === 0) {
        channelVoiceState.delete(channelId)
      } else {
        const remaining = Array.from(channel.values()).map((p) => ({
          userId: p.userId,
          username: p.username,
          avatarUrl: p.avatarUrl,
          isMuted: p.isMuted,
          isDeafened: p.isDeafened,
          isSpeaking: p.isSpeaking,
          isScreenSharing: Boolean(p.isScreenSharing),
          hasCamera: Boolean(p.hasCamera),
        }))
        broadcastChannelEvent(channelId, 'participants', remaining)
      }
      broadcastChannelEvent(channelId, 'participant_left', { userId, channelId })
    }
  }
  for (const gId of affectedGuilds) {
    broadcastGuildVoiceState(gId)
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

      // Difunde imediatamente a entrada do participante para todos os peers conectados no canal via SSE
      broadcastChannelEvent(channelId, 'participants', participants, userId)

      // Difunde o novo estado de voz para todos os ouvintes da guilda via SSE
      if (guildId) {
        broadcastGuildVoiceState(guildId)
      }

      return reply.code(200).send({ success: true, channelId, myUserId: userId, participants })
    }
  )

  /**
   * POST /api/channels/:channelId/voice/heartbeat
   * Atualiza keep-alive e status de fala/mudo do participante.
   */
  app.post(
    '/api/channels/:channelId/voice/heartbeat',
    { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
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
        const effectiveMuted = typeof isMuted === 'boolean' ? isMuted : participant.isMuted
        const effectiveDeafened = typeof isDeafened === 'boolean' ? isDeafened : participant.isDeafened
        const rawSpeaking = typeof isSpeaking === 'boolean' ? isSpeaking : participant.isSpeaking
        const effectiveSpeaking = (effectiveMuted || effectiveDeafened) ? false : rawSpeaking

        const stateChanged =
          participant.isSpeaking !== effectiveSpeaking ||
          participant.isMuted !== effectiveMuted ||
          participant.isDeafened !== effectiveDeafened ||
          (typeof isScreenSharing === 'boolean' && participant.isScreenSharing !== isScreenSharing) ||
          (typeof hasCamera === 'boolean' && participant.hasCamera !== hasCamera)

        participant.isSpeaking = effectiveSpeaking
        participant.isMuted = effectiveMuted
        participant.isDeafened = effectiveDeafened
        if (typeof isScreenSharing === 'boolean') participant.isScreenSharing = isScreenSharing
        if (typeof hasCamera === 'boolean') participant.hasCamera = hasCamera
        if (guildId && !participant.guildId) participant.guildId = normalizeChannelId(guildId)
        if (username && participant.username === userId.replace(/^@/, '').split(':')[0]) participant.username = username
        if (avatarUrl && !participant.avatarUrl) participant.avatarUrl = avatarUrl

        if (stateChanged && participant.guildId) {
          broadcastGuildVoiceState(participant.guildId)
        }
      }

      const participants = Array.from(channel.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl,
        isMuted: Boolean(p.isMuted),
        isDeafened: Boolean(p.isDeafened),
        isSpeaking: (p.isMuted || p.isDeafened) ? false : Boolean(p.isSpeaking),
        isScreenSharing: Boolean(p.isScreenSharing),
        hasCamera: Boolean(p.hasCamera),
      }))

      const curP = channel.get(userId)
      // Difunde atualizações de estado (mudo, fala, tela, câmera) em tempo real via SSE
      broadcastChannelEvent(channelId, 'participant_updated', {
        userId,
        isSpeaking: (curP?.isMuted || curP?.isDeafened) ? false : (typeof isSpeaking === 'boolean' ? isSpeaking : curP?.isSpeaking),
        isMuted: curP ? curP.isMuted : (typeof isMuted === 'boolean' ? isMuted : undefined),
        isDeafened: curP ? curP.isDeafened : (typeof isDeafened === 'boolean' ? isDeafened : undefined),
        isScreenSharing: curP ? curP.isScreenSharing : (typeof isScreenSharing === 'boolean' ? isScreenSharing : undefined),
        hasCamera: curP ? curP.hasCamera : (typeof hasCamera === 'boolean' ? hasCamera : undefined),
      }, userId)

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
        let targetGuildId = null
        if (channel) {
          const p = channel.get(userId)
          if (p?.guildId) targetGuildId = p.guildId
          channel.delete(userId)
          if (channel.size === 0) {
            channelVoiceState.delete(channelId)
          } else {
            const remaining = Array.from(channel.values()).map((p) => ({
              userId: p.userId,
              username: p.username,
              avatarUrl: p.avatarUrl,
              isMuted: p.isMuted,
              isDeafened: p.isDeafened,
              isSpeaking: p.isSpeaking,
              isScreenSharing: Boolean(p.isScreenSharing),
              hasCamera: Boolean(p.hasCamera),
            }))
            broadcastChannelEvent(channelId, 'participants', remaining)
          }
        }
        broadcastChannelEvent(channelId, 'participant_left', { userId, channelId })
        if (targetGuildId) {
          broadcastGuildVoiceState(targetGuildId)
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
      pruneAllStaleParticipants()
      const data = getGuildVoiceStateData(guildId)
      return reply.code(200).send(data)
    }
  )

  /**
   * GET /api/guilds/:guildId/voice/events
   * Stream Server-Sent Events (SSE) do estado de voz de uma guilda em tempo real.
   * Elimina completamente a necessidade de polling periódico (1.5s).
   */
  app.get(
    '/api/guilds/:guildId/voice/events',
    { preHandler: authenticate },
    async (request, reply) => {
      const guildId = normalizeChannelId(request.params.guildId)
      const userId = request.user.userId

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      // Envia snapshot inicial imediato
      const initialData = getGuildVoiceStateData(guildId)
      reply.raw.write(`event: voice_state\ndata: ${JSON.stringify(initialData)}\n\n`)

      if (!guildSseClients.has(guildId)) {
        guildSseClients.set(guildId, new Map())
      }
      const clients = guildSseClients.get(guildId)

      const existing = clients.get(userId)
      if (existing?.keepaliveInterval) {
        clearInterval(existing.keepaliveInterval)
      }

      // Ping keepalive a cada 20s
      const keepaliveInterval = setInterval(() => {
        try {
          reply.raw.write(': ping\n\n')
        } catch {
          clearInterval(keepaliveInterval)
          clients.delete(userId)
        }
      }, 20000)

      clients.set(userId, { reply, request, keepaliveInterval })

      request.raw.on('close', () => {
        clearInterval(keepaliveInterval)
        const currentClients = guildSseClients.get(guildId)
        if (currentClients) {
          currentClients.delete(userId)
          if (currentClients.size === 0) {
            guildSseClients.delete(guildId)
          }
        }
      })
    }
  )

  /**
   * POST /api/channels/:channelId/voice/signal
   * Envia uma mensagem de sinalização WebRTC (offer, answer, ICE candidate).
   * Despacha instantaneamente via SSE (<20ms) e armazena em fila como fallback.
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

      const signalPayload = {
        fromUserId,
        channelId,
        signal,
        timestamp: Date.now(),
      }

      // 1. Tenta envio instantâneo direto pelo stream push SSE (<20ms)
      const deliveredRealtime = sendUserEvent(targetUserId, 'signal', signalPayload)

      // 2. Mantém na fila com limite defensivo como garantia/fallback
      if (!signalQueues.has(targetUserId)) {
        signalQueues.set(targetUserId, [])
      }

      const queue = signalQueues.get(targetUserId)
      queue.push(signalPayload)

      // Limita fila a 50 sinais para evitar vazamento
      if (queue.length > 50) {
        queue.splice(0, queue.length - 50)
      }

      return reply.code(200).send({ success: true, delivered: deliveredRealtime ? 'realtime' : 'queued' })
    }
  )

  /**
   * GET /api/channels/:channelId/voice/signals
   * Recupera e consome os sinais WebRTC destinados ao usuário atual (fallback HTTP polling).
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

  /**
   * GET /api/channels/:channelId/voice/events
   * Stream de eventos Server-Sent Events (SSE) para sinalização e presença instantâneas (<20ms).
   */
  app.get(
    '/api/channels/:channelId/voice/events',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const userId = request.user.userId

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      // Notifica cliente de conexão SSE pronta
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ userId, channelId, timestamp: Date.now() })}\n\n`)

      if (!channelSseClients.has(channelId)) {
        channelSseClients.set(channelId, new Map())
      }
      const clients = channelSseClients.get(channelId)

      // Se já existia conexão anterior para este mesmo usuário, limpa o keepalive anterior
      const existing = clients.get(userId)
      if (existing?.keepaliveInterval) {
        clearInterval(existing.keepaliveInterval)
      }

      // Keepalive a cada 15 segundos para manter viva a conexão através de proxies/Cloudflare
      const keepaliveInterval = setInterval(() => {
        try {
          reply.raw.write(': ping\n\n')
        } catch {
          clearInterval(keepaliveInterval)
          clients.delete(userId)
        }
      }, 15000)

      clients.set(userId, { reply, request, keepaliveInterval })

      // Se houver sinais pendentes na fila, despacha imediatamente
      if (signalQueues.has(userId)) {
        const queued = signalQueues.get(userId) || []
        const relevant = queued.filter((s) => !channelId || s.channelId === channelId)
        for (const item of relevant) {
          try {
            reply.raw.write(`event: signal\ndata: ${JSON.stringify(item)}\n\n`)
          } catch {}
        }
        signalQueues.delete(userId)
      }

      // Cleanup ao fechar o socket
      request.raw.on('close', () => {
        clearInterval(keepaliveInterval)
        const currentClients = channelSseClients.get(channelId)
        if (currentClients) {
          currentClients.delete(userId)
          if (currentClients.size === 0) {
            channelSseClients.delete(channelId)
          }
        }
      })
    }
  )

  /**
   * Move a member from one voice channel to another (requires MOVE_MEMBERS permission).
   * POST /voice/channels/:channelId/move-user
   */
  app.post('/voice/channels/:channelId/move-user', { preHandler: authenticate }, async (request, reply) => {
    const targetChannelId = normalizeChannelId(request.params.channelId)
    const { userId: targetUserId, guildId } = request.body || {}
    const requesterId = request.user.userId

    if (!targetChannelId || !targetUserId) {
      return reply.code(400).send({ error: 'channelId e userId são obrigatórios' })
    }

    // Verify MOVE_MEMBERS permission via guildProfileService
    try {
      const { default: guildProfileService } = await import('../services/guildProfileService.js')
      const canMove = await guildProfileService.canUserManageChannels(guildId, requesterId)
      // Fallback: check if user has MOVE_MEMBERS in any role
      if (!canMove) {
        return reply.code(403).send({ error: 'Permissão negada: MOVE_MEMBERS necessário' })
      }
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao verificar permissões' })
    }

    // Find source channel of the target user
    let sourceChannelId = null
    for (const [chId, participants] of channelVoiceState.entries()) {
      if (participants.has(targetUserId)) {
        sourceChannelId = chId
        break
      }
    }

    if (!sourceChannelId) {
      return reply.code(404).send({ error: 'Usuário não está em nenhum canal de voz' })
    }

    if (sourceChannelId === targetChannelId) {
      return reply.code(200).send({ success: true, message: 'Usuário já está no canal de destino' })
    }

    // Remove from source
    const sourceParticipants = channelVoiceState.get(sourceChannelId)
    if (sourceParticipants) {
      sourceParticipants.delete(targetUserId)
      broadcastChannelEvent(sourceChannelId, 'user-left', { userId: targetUserId })
      if (sourceParticipants.size === 0) {
        channelVoiceState.delete(sourceChannelId)
      }
    }

    // Add to target
    if (!channelVoiceState.has(targetChannelId)) {
      channelVoiceState.set(targetChannelId, new Map())
    }
    const targetParticipants = channelVoiceState.get(targetChannelId)
    // Preserve existing state or create minimal entry
    const existingState = sourceParticipants?.get(targetUserId)
    targetParticipants.set(targetUserId, {
      userId: targetUserId,
      username: existingState?.username || targetUserId.replace(/^@/, '').split(':')[0],
      avatarUrl: existingState?.avatarUrl || null,
      guildId: guildId ? normalizeChannelId(guildId) : null,
      isMuted: existingState?.isMuted || false,
      isDeafened: existingState?.isDeafened || false,
      isSpeaking: false,
      isScreenSharing: existingState?.isScreenSharing || false,
      hasCamera: existingState?.hasCamera || false,
      lastHeartbeat: Date.now(),
    })

    broadcastChannelEvent(targetChannelId, 'user-joined', {
      userId: targetUserId,
      username: targetParticipants.get(targetUserId).username,
      avatarUrl: targetParticipants.get(targetUserId).avatarUrl,
      isMuted: targetParticipants.get(targetUserId).isMuted,
      isDeafened: targetParticipants.get(targetUserId).isDeafened,
    })

    // Notify the moved user directly so their client switches channels
    sendUserEvent(targetUserId, 'force-move', { channelId: targetChannelId, guildId })

    return reply.code(200).send({ success: true, from: sourceChannelId, to: targetChannelId })
  })

  /**
   * POST /api/channels/:channelId/voice/token
   * Gera token JWT de acesso ao LiveKit SFU para o canal de voz/live.
   * Retorna { enabled: false } quando LIVEKIT_URL/API_KEY/API_SECRET não estiverem configurados,
   * permitindo fallback transparente para WebRTC Mesh.
   */
  app.post(
    '/api/channels/:channelId/voice/token',
    { preHandler: authenticate },
    async (request, reply) => {
      const channelId = normalizeChannelId(request.params.channelId)
      const userId = request.user.userId
      const { username, avatarUrl } = request.body || {}

      if (!channelId) {
        return reply.code(400).send({ error: 'channelId é obrigatório' })
      }

      const serverUrl = process.env.LIVEKIT_URL?.trim()
      const apiKey = process.env.LIVEKIT_API_KEY?.trim()
      const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()

      if (!serverUrl || !apiKey || !apiSecret) {
        return reply.code(200).send({
          enabled: false,
          serverUrl: null,
          token: null,
        })
      }

      const displayName = username || userId.replace(/^@/, '').split(':')[0]
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId,
        name: displayName,
        metadata: JSON.stringify({ avatarUrl: avatarUrl || null }),
        ttl: '6h',
      })

      at.addGrant({
        roomJoin: true,
        room: channelId,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      })

      const token = await at.toJwt()
      return reply.code(200).send({
        enabled: true,
        serverUrl,
        token,
        roomName: channelId,
      })
    }
  )

  /**
   * POST /api/voice/livekit-webhook
   * Recebe eventos de presença do LiveKit Server para sincronizar a barra lateral das guildas.
   */
  app.post('/api/voice/livekit-webhook', async (request, reply) => {
    const apiKey = process.env.LIVEKIT_API_KEY?.trim()
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim()
    if (!apiKey || !apiSecret) {
      return reply.code(200).send({ ok: true, ignored: true })
    }

    try {
      const receiver = new WebhookReceiver(apiKey, apiSecret)
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})
      const event = await receiver.receive(rawBody, request.headers.authorization)

      const channelId = normalizeChannelId(event?.room?.name)
      const userId = event?.participant?.identity

      if (channelId && userId) {
        if (event.event === 'participant_left') {
          const ch = channelVoiceState.get(channelId)
          if (ch && ch.has(userId)) {
            const p = ch.get(userId)
            ch.delete(userId)
            if (ch.size === 0) channelVoiceState.delete(channelId)
            broadcastChannelEvent(channelId, 'participant_left', { userId, channelId })
            if (p?.guildId) broadcastGuildVoiceState(p.guildId)
          }
        }
      }
      return reply.code(200).send({ ok: true })
    } catch (err) {
      request.log.warn({ err }, '[LiveKit Webhook] Assinatura inválida ou payload malformado')
      return reply.code(401).send({ error: 'Invalid webhook signature' })
    }
  })
}
