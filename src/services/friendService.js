import { prisma } from '../db.js'
import { getMatrixClient } from '../lib/matrix/client.js'
import { getUserAccessTokenDB } from '../lib/auth/tokenStore.js'

/**
 * Normaliza e busca o perfil de um usuário para exibição em listas de amizade.
 */
function formatUserProfile(userId, profile) {
  const fallbackUsername = userId ? userId.replace(/^@/, '').split(':')[0] : 'usuario'
  const username = profile?.username || fallbackUsername
  const displayName = profile?.nickname || profile?.displayName || username
  return {
    userId,
    username,
    nickname: profile?.nickname || null,
    displayName,
    avatarUrl: profile?.avatarUrl || null,
    bio: profile?.bio || null,
  }
}

/**
 * Lista amigos aceitos, solicitações pendentes e usuários bloqueados para o usuário atual.
 *
 * @param {string} userId - Matrix User ID do solicitante
 * @param {any} [db] - Prisma client instance
 */
export async function listFriends(userId, db = prisma) {
  if (!userId) {
    throw new Error('userId é obrigatório')
  }

  const relationships = await db.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId },
        { addresseeId: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Coleta os IDs de todos os outros usuários envolvidos
  const otherUserIds = Array.from(
    new Set(
      relationships.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
    )
  )

  // Busca os perfis de todos em lote
  const profiles = otherUserIds.length > 0
    ? await db.userProfile.findMany({
        where: { userId: { in: otherUserIds } },
      })
    : []

  const profileMap = new Map(profiles.map((p) => [p.userId, p]))

  const friends = []
  const pendingIncoming = []
  const pendingOutgoing = []
  const blocked = []

  for (const r of relationships) {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId
    const otherProfile = profileMap.get(otherId)
    const formatted = formatUserProfile(otherId, otherProfile)

    if (r.status === 'accepted') {
      friends.push({
        friendshipId: r.id,
        userId: otherId,
        nickname: formatted.nickname,
        displayName: formatted.displayName,
        avatarUrl: formatted.avatarUrl,
        bio: formatted.bio,
        status: 'accepted',
        directRoomId: (r.directRoomId && !r.directRoomId.startsWith('!dm_')) ? r.directRoomId : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
    } else if (r.status === 'pending') {
      if (r.addresseeId === userId) {
        pendingIncoming.push({
          friendshipId: r.id,
          user: formatted,
          createdAt: r.createdAt,
        })
      } else {
        pendingOutgoing.push({
          friendshipId: r.id,
          user: formatted,
          createdAt: r.createdAt,
        })
      }
    } else if (r.status === 'blocked' && r.blockedById === userId) {
      blocked.push({
        friendshipId: r.id,
        user: formatted,
        createdAt: r.createdAt,
      })
    }
  }

  return {
    friends,
    pendingIncoming,
    pendingOutgoing,
    blocked,
  }
}

/**
 * Envia ou aceita automaticamente uma solicitação de amizade.
 *
 * @param {string} requesterId - Matrix User ID de quem envia
 * @param {string} targetInput - Username, nickname ou MXID do destinatário
 * @param {any} [db] - Prisma client instance
 */
export async function sendFriendRequest(requesterId, targetInput, db = prisma) {
  if (!requesterId) throw new Error('requesterId é obrigatório')
  if (!targetInput || typeof targetInput !== 'string' || !targetInput.trim()) {
    throw new Error('Nome ou ID do usuário destinatário é obrigatório')
  }

  const trimmed = targetInput.trim()
  let targetUserId = null

  if (trimmed.startsWith('@') && trimmed.includes(':')) {
    targetUserId = trimmed
  } else {
    // Procura por username ou nickname
    const cleanHandle = trimmed.replace(/^@/, '').toLowerCase()
    const profile = await db.userProfile.findFirst({
      where: {
        OR: [
          { username: cleanHandle },
          { username: trimmed },
          { nickname: trimmed },
        ],
      },
    })

    if (profile) {
      targetUserId = profile.userId
    } else {
      // Tenta interpretar como username na homeserver padrão
      const server = process.env.SYNAPSE_SERVER_NAME || 'litteris.online'
      const candidateMxid = trimmed.startsWith('@') ? `${trimmed}:${server}` : `@${trimmed}:${server}`

      // Verifica se existe perfil ou token para este MXID
      const existingUser = await db.userProfile.findUnique({
        where: { userId: candidateMxid },
      })

      if (existingUser) {
        targetUserId = candidateMxid
      } else {
        const tokenUser = await db.userToken.findUnique({
          where: { userId: candidateMxid },
        })
        if (tokenUser) {
          targetUserId = candidateMxid
        } else {
          // Se começou com @, aceita o MXID formatado mesmo que o perfil ainda não tenha sido criado
          if (trimmed.startsWith('@')) {
            targetUserId = candidateMxid
          } else {
            throw new Error(`Usuário "${trimmed}" não encontrado`)
          }
        }
      }
    }
  }

  if (targetUserId === requesterId) {
    throw new Error('Você não pode adicionar a si mesmo como amigo')
  }

  // Verifica relação existente
  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: requesterId },
      ],
    },
  })

  if (existing) {
    if (existing.status === 'blocked') {
      if (existing.blockedById === requesterId) {
        throw new Error('Você bloqueou este usuário. Desbloqueie-o antes de enviar solicitação.')
      }
      throw new Error('Não foi possível enviar solicitação para este usuário.')
    }

    if (existing.status === 'accepted') {
      throw new Error('Vocês já são amigos.')
    }

    if (existing.status === 'pending') {
      if (existing.requesterId === requesterId) {
        throw new Error('Solicitação de amizade já enviada.')
      }

      // O outro usuário já havia enviado solicitação -> Aceite mútuo automático!
      const updated = await db.friendship.update({
        where: { id: existing.id },
        data: {
          status: 'accepted',
          blockedById: null,
        },
      })
      return { ...updated, autoAccepted: true }
    }

    // Se estava declined, reabre como pending
    const reopened = await db.friendship.update({
      where: { id: existing.id },
      data: {
        requesterId,
        addresseeId: targetUserId,
        status: 'pending',
        blockedById: null,
      },
    })
    return reopened
  }

  // Cria nova solicitação
  const created = await db.friendship.create({
    data: {
      requesterId,
      addresseeId: targetUserId,
      status: 'pending',
    },
  })

  return created
}

/**
 * Aceita uma solicitação de amizade pendente.
 */
export async function acceptFriendRequest(userId, friendshipId, db = prisma) {
  if (!friendshipId) throw new Error('friendshipId é obrigatório')

  const friendship = await db.friendship.findUnique({
    where: { id: friendshipId },
  })

  if (!friendship) {
    const error = new Error('Solicitação de amizade não encontrada')
    error.statusCode = 404
    throw error
  }

  if (friendship.status !== 'pending') {
    throw new Error('Esta solicitação não está pendente')
  }

  if (friendship.addresseeId !== userId) {
    const error = new Error('Apenas o destinatário pode aceitar esta solicitação')
    error.statusCode = 403
    throw error
  }

  const updated = await db.friendship.update({
    where: { id: friendshipId },
    data: { status: 'accepted' },
  })

  return updated
}

/**
 * Recusa uma solicitação de amizade pendente.
 */
export async function declineFriendRequest(userId, friendshipId, db = prisma) {
  if (!friendshipId) throw new Error('friendshipId é obrigatório')

  const friendship = await db.friendship.findUnique({
    where: { id: friendshipId },
  })

  if (!friendship) {
    const error = new Error('Solicitação de amizade não encontrada')
    error.statusCode = 404
    throw error
  }

  if (friendship.addresseeId !== userId && friendship.requesterId !== userId) {
    const error = new Error('Acesso negado')
    error.statusCode = 403
    throw error
  }

  await db.friendship.delete({
    where: { id: friendshipId },
  })

  return { success: true, message: 'Solicitação recusada' }
}

/**
 * Cancela uma solicitação de amizade enviada pelo próprio usuário.
 */
export async function cancelFriendRequest(userId, friendshipId, db = prisma) {
  if (!friendshipId) throw new Error('friendshipId é obrigatório')

  const friendship = await db.friendship.findUnique({
    where: { id: friendshipId },
  })

  if (!friendship) {
    const error = new Error('Solicitação não encontrada')
    error.statusCode = 404
    throw error
  }

  if (friendship.requesterId !== userId) {
    const error = new Error('Apenas quem enviou a solicitação pode cancelá-la')
    error.statusCode = 403
    throw error
  }

  if (friendship.status !== 'pending') {
    throw new Error('Esta solicitação não está pendente')
  }

  await db.friendship.delete({
    where: { id: friendshipId },
  })

  return { success: true, message: 'Solicitação cancelada' }
}

/**
 * Desfaz uma amizade aceita existente.
 */
export async function removeFriend(userId, friendshipId, db = prisma) {
  if (!friendshipId) throw new Error('friendshipId é obrigatório')

  const friendship = await db.friendship.findUnique({
    where: { id: friendshipId },
  })

  if (!friendship) {
    const error = new Error('Amizade não encontrada')
    error.statusCode = 404
    throw error
  }

  if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
    const error = new Error('Acesso negado')
    error.statusCode = 403
    throw error
  }

  await db.friendship.delete({
    where: { id: friendshipId },
  })

  return { success: true, message: 'Amizade desfeita' }
}

/**
 * Bloqueia um usuário.
 */
export async function blockUser(userId, targetUserId, db = prisma) {
  if (!targetUserId) throw new Error('targetUserId é obrigatório')
  if (userId === targetUserId) {
    throw new Error('Você não pode bloquear a si mesmo')
  }

  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
  })

  if (existing) {
    const updated = await db.friendship.update({
      where: { id: existing.id },
      data: {
        status: 'blocked',
        blockedById: userId,
      },
    })
    return updated
  }

  const created = await db.friendship.create({
    data: {
      requesterId: userId,
      addresseeId: targetUserId,
      status: 'blocked',
      blockedById: userId,
    },
  })

  return created
}

/**
 * Desbloqueia um usuário previamente bloqueado.
 */
export async function unblockUser(userId, targetUserIdOrFriendshipId, db = prisma) {
  if (!targetUserIdOrFriendshipId) throw new Error('Identificador de usuário ou amizade é obrigatório')

  const existing = await db.friendship.findFirst({
    where: {
      AND: [
        {
          OR: [
            { id: targetUserIdOrFriendshipId },
            { requesterId: userId, addresseeId: targetUserIdOrFriendshipId },
            { requesterId: targetUserIdOrFriendshipId, addresseeId: userId },
          ],
        },
        { status: 'blocked' },
        { blockedById: userId },
      ],
    },
  })

  if (!existing) {
    const error = new Error('Bloqueio não encontrado')
    error.statusCode = 404
    throw error
  }

  await db.friendship.delete({
    where: { id: existing.id },
  })

  return { success: true, message: 'Usuário desbloqueado' }
}

/**
 * Obtém ou cria a sala Matrix 1-a-1 de conversa direta (DM) entre dois usuários.
 */
export async function getOrCreateDirectRoom(userId, targetUserId, accessToken, db = prisma) {
  if (!userId || !targetUserId) throw new Error('userId e targetUserId são obrigatórios')

  const friendship = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: userId },
      ],
    },
  })

  // Se o usuário estiver bloqueado (em qualquer sentido), impede abertura de DM
  if (friendship?.status === 'blocked') {
    const error = new Error('Não é possível iniciar conversa com usuário bloqueado')
    error.statusCode = 403
    throw error
  }

  // Se já houver um directRoomId válido gravado (não-mock), garante que ambos os participantes estejam na sala
  if (friendship?.directRoomId && !friendship.directRoomId.startsWith('!dm_')) {
    const existingRoomId = friendship.directRoomId

    // Garante que o solicitante esteja dentro da sala
    if (accessToken) {
      try {
        const client = getMatrixClient(userId, accessToken)
        if (client && typeof client.joinRoom === 'function') {
          await client.joinRoom(existingRoomId).catch(() => {})
        }
      } catch (err) {
        console.warn('[friendService] Falha ao verificar/entrar na sala direta:', err.message)
      }
    }

    // Auto-join do usuário alvo se tiver token registrado no banco
    try {
      const targetToken = await getUserAccessTokenDB(db, targetUserId).catch(() => null)
      if (targetToken) {
        const targetClient = getMatrixClient(targetUserId, targetToken)
        if (targetClient && typeof targetClient.joinRoom === 'function') {
          await targetClient.joinRoom(existingRoomId).catch(() => {})
        }
      }
    } catch (err) {
      console.warn('[friendService] Falha no auto-join do destinatário:', err.message)
    }

    return { roomId: existingRoomId }
  }

  let roomId = null

  if (accessToken) {
    try {
      const client = getMatrixClient(userId, accessToken)
      if (client && typeof client.createRoom === 'function') {
        const res = await client.createRoom({
          is_direct: true,
          preset: 'trusted_private_chat',
          invite: [targetUserId],
          visibility: 'private',
        })
        roomId = typeof res === 'string' ? res : (res?.room_id || res?.roomId)

        // Se criou a sala com sucesso, faz o auto-join do usuário convidado
        if (roomId) {
          try {
            const targetToken = await getUserAccessTokenDB(db, targetUserId).catch(() => null)
            if (targetToken) {
              const targetClient = getMatrixClient(targetUserId, targetToken)
              if (targetClient && typeof targetClient.joinRoom === 'function') {
                await targetClient.joinRoom(roomId).catch(() => {})
              }
            }
          } catch (err) {
            console.warn('[friendService] Falha no auto-join do destinatário na nova sala:', err.message)
          }
        }
      }
    } catch (err) {
      console.warn('[friendService] Falha ao criar sala direta no Synapse:', err.message)
    }
  }

  if (!roomId) {
    if (process.env.NODE_ENV === 'test') {
      const cleanUser = targetUserId.replace(/[@:]/g, '_')
      roomId = `!dm_${cleanUser}_${Date.now()}:${process.env.SYNAPSE_SERVER_NAME || 'litteris.online'}`
    } else {
      throw new Error('Não foi possível criar a sala de mensagem direta no Synapse')
    }
  }

  if (friendship) {
    await db.friendship.update({
      where: { id: friendship.id },
      data: { directRoomId: roomId },
    })
  } else {
    try {
      await db.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: targetUserId,
          status: 'accepted',
          directRoomId: roomId,
        },
      })
    } catch {
      // Ignora erro se registro concorrente já foi criado
    }
  }

  return { roomId }
}

/**
 * Lista usuários cadastrados no sistema para descoberta, ordenados pelos mais recentes.
 * Exclui o próprio usuário e usuários bloqueados.
 * Anota o status da relação ("friend", "pending_incoming", "pending_outgoing", "none").
 *
 * @param {string} userId - Matrix User ID do usuário atual
 * @param {object} [options]
 * @param {string} [options.query] - Termo de busca opcional (nome, apelido ou userId)
 * @param {number} [options.limit] - Quantidade máxima de resultados (padrão 50)
 * @param {any} [db] - Prisma client instance
 */
export async function discoverUsers(userId, options = {}, db = prisma) {
  if (!userId) {
    throw new Error('userId é obrigatório')
  }

  const limit = options.limit || 50
  const query = (options.query || '').toLowerCase().trim()

  // 1. Busca relacionamentos existentes do usuário para mapear status
  const relationships = await db.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId },
        { addresseeId: userId },
      ],
    },
  })

  const relMap = new Map()
  const blockedIds = new Set()

  for (const r of relationships) {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId
    if (r.status === 'blocked') {
      blockedIds.add(otherId)
    } else if (r.status === 'accepted') {
      relMap.set(otherId, { status: 'friend', friendshipId: r.id, directRoomId: r.directRoomId })
    } else if (r.status === 'pending') {
      if (r.requesterId === userId) {
        relMap.set(otherId, { status: 'pending_outgoing', friendshipId: r.id })
      } else {
        relMap.set(otherId, { status: 'pending_incoming', friendshipId: r.id })
      }
    }
  }

  // 2. Busca usuários tanto de UserToken quanto de UserProfile no banco
  const [tokens, dbProfiles] = await Promise.all([
    db.userToken?.findMany
      ? db.userToken.findMany({
          where: {
            userId: {
              not: userId,
              notIn: Array.from(blockedIds),
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: limit * 2,
        })
      : Promise.resolve([]),
    db.userProfile?.findMany
      ? db.userProfile.findMany({
          where: {
            userId: {
              not: userId,
              notIn: Array.from(blockedIds),
            },
          },
          take: limit * 2,
        })
      : Promise.resolve([]),
  ])

  // 3. Opcionalmente busca usuários no diretório nativo do Matrix Synapse
  let synapseUsers = []
  if (options.accessToken) {
    try {
      const synapseUrl = process.env.SYNAPSE_URL || 'https://echo.litteris.online'
      const response = await fetch(`${synapseUrl}/_matrix/client/v3/user_directory/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          search_term: query || ' ',
          limit: Math.max(limit, 20),
        }),
      })
      if (response.ok) {
        const body = await response.json()
        synapseUsers = body.results || []
      }
    } catch {
      // Ignora falha de rede do Synapse sem interromper o fluxo
    }
  }

  // 4. Consolida todos os IDs únicos preservando os mais recentes primeiro
  const seenUserIds = new Set()
  const candidateUserIds = []
  const tokenMap = new Map()

  for (const t of tokens) {
    tokenMap.set(t.userId, t)
    if (!seenUserIds.has(t.userId)) {
      seenUserIds.add(t.userId)
      candidateUserIds.push(t.userId)
    }
  }

  for (const p of dbProfiles) {
    if (!seenUserIds.has(p.userId)) {
      seenUserIds.add(p.userId)
      candidateUserIds.push(p.userId)
    }
  }

  const synapseMap = new Map()
  for (const su of synapseUsers) {
    if (!su.user_id || su.user_id === userId || blockedIds.has(su.user_id)) continue
    synapseMap.set(su.user_id, su)
    if (!seenUserIds.has(su.user_id)) {
      seenUserIds.add(su.user_id)
      candidateUserIds.push(su.user_id)
    }
  }

  // 5. Garante perfis completos de UserProfile
  const missingProfileIds = candidateUserIds.filter(
    (id) => !dbProfiles.some((p) => p.userId === id)
  )
  let additionalProfiles = []
  if (missingProfileIds.length > 0 && db.userProfile?.findMany) {
    additionalProfiles = await db.userProfile.findMany({
      where: { userId: { in: missingProfileIds } },
    })
  }

  const profileMap = new Map(
    [...dbProfiles, ...additionalProfiles].map((p) => [p.userId, p])
  )

  // 6. Monta lista consolidada
  const results = []
  for (const candidateId of candidateUserIds) {
    const profile = profileMap.get(candidateId)
    const formatted = formatUserProfile(candidateId, profile)
    const token = tokenMap.get(candidateId)
    const synapseUser = synapseMap.get(candidateId)
    const rel = relMap.get(candidateId) || { status: 'none' }

    const displayName = formatted.displayName || synapseUser?.display_name || candidateId
    const avatarUrl = formatted.avatarUrl || synapseUser?.avatar_url || null

    if (query) {
      const matchUserId = candidateId.toLowerCase().includes(query)
      const matchNickname = (formatted.nickname || '').toLowerCase().includes(query)
      const matchDisplayName = displayName.toLowerCase().includes(query)
      const matchBio = (formatted.bio || '').toLowerCase().includes(query)
      if (!matchUserId && !matchNickname && !matchDisplayName && !matchBio) {
        continue
      }
    }

    results.push({
      userId: candidateId,
      username: formatted.username,
      displayName,
      nickname: formatted.nickname,
      avatarUrl,
      bio: formatted.bio,
      status: rel.status,
      friendshipId: rel.friendshipId || null,
      directRoomId: rel.directRoomId || null,
      joinedAt: token?.updatedAt || null,
    })

    if (results.length >= limit) {
      break
    }
  }

  return { users: results }
}

