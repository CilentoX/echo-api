import { prisma } from '../db.js'
import { getMatrixClient } from '../lib/matrix/client.js'

/**
 * Normaliza e busca o perfil de um usuário para exibição em listas de amizade.
 */
function formatUserProfile(userId, profile) {
  const fallbackName = userId ? userId.replace(/^@/, '').split(':')[0] : 'Usuário'
  return {
    userId,
    nickname: profile?.nickname || null,
    displayName: profile?.nickname || fallbackName,
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
        directRoomId: r.directRoomId || null,
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
    // Procura por nickname
    const profile = await db.userProfile.findFirst({
      where: { nickname: trimmed },
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

  if (friendship?.directRoomId) {
    return { roomId: friendship.directRoomId }
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
      }
    } catch (err) {
      console.warn('[friendService] Falha ao criar sala direta no Synapse:', err.message)
    }
  }

  if (!roomId) {
    const cleanUser = targetUserId.replace(/[@:]/g, '_')
    roomId = `!dm_${cleanUser}_${Date.now()}:${process.env.SYNAPSE_SERVER_NAME || 'litteris.online'}`
  }

  if (friendship) {
    await db.friendship.update({
      where: { id: friendship.id },
      data: { directRoomId: roomId },
    })
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

  // 2. Busca todos os usuários de UserToken (ordenados pelos mais recentes)
  const tokens = await db.userToken.findMany({
    where: {
      userId: {
        not: userId,
        notIn: Array.from(blockedIds),
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit * 2,
  })

  const userIds = tokens.map((t) => t.userId)

  // 3. Busca perfis de UserProfile
  const profiles = userIds.length > 0
    ? await db.userProfile.findMany({
        where: { userId: { in: userIds } },
      })
    : []

  const profileMap = new Map(profiles.map((p) => [p.userId, p]))

  // 4. Monta lista consolidada
  const results = []
  for (const token of tokens) {
    const profile = profileMap.get(token.userId)
    const formatted = formatUserProfile(token.userId, profile)
    const rel = relMap.get(token.userId) || { status: 'none' }

    if (query) {
      const matchUserId = formatted.userId.toLowerCase().includes(query)
      const matchNickname = (formatted.nickname || '').toLowerCase().includes(query)
      const matchDisplayName = (formatted.displayName || '').toLowerCase().includes(query)
      if (!matchUserId && !matchNickname && !matchDisplayName) {
        continue
      }
    }

    results.push({
      userId: formatted.userId,
      displayName: formatted.displayName,
      nickname: formatted.nickname,
      avatarUrl: formatted.avatarUrl,
      bio: formatted.bio,
      status: rel.status,
      friendshipId: rel.friendshipId || null,
      directRoomId: rel.directRoomId || null,
      joinedAt: token.updatedAt,
    })

    if (results.length >= limit) {
      break
    }
  }

  return { users: results }
}

