import { authenticate } from '../plugins/auth.js'
import { guildProfileService } from '../services/guildProfileService.js'

/**
 * Registers all Guild, Channel, and Invite routes for Echo API.
 * Supports both /guilds and /api/guilds, /channels and /api/channels, /invites and /api/invites.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerGuildRoutes(app) {
  // ── Guilds Endpoints ──────────────────────────────────────────────

  const handleListGuilds = async (request, reply) => {
    try {
      const guilds = await guildProfileService.listGuilds({
        userId: request.user?.userId,
        accessToken: request.user?.accessToken,
      })
      return reply.code(200).send(guilds)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao buscar guildas' })
    }
  }

  app.get('/guilds', { preHandler: authenticate }, handleListGuilds)
  app.get('/api/guilds', { preHandler: authenticate }, handleListGuilds)

  const handleCreateGuild = async (request, reply) => {
    try {
      const { name, iconUrl, avatarUrl, bannerUrl, description, createdBy } = request.body || {}
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'Nome da guilda é obrigatório' })
      }

      const guild = await guildProfileService.createGuild({
        name: name.trim(),
        iconUrl: iconUrl || avatarUrl,
        bannerUrl,
        description,
        createdBy,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })

      return reply.code(201).send(guild)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao criar guilda: ' + (err.message || 'desconhecido') })
    }
  }

  app.post('/guilds', { preHandler: authenticate }, handleCreateGuild)
  app.post('/api/guilds', { preHandler: authenticate }, handleCreateGuild)

  const handleDeleteGuild = async (request, reply) => {
    try {
      const { guildId } = request.params
      const result = await guildProfileService.deleteGuild({
        guildId,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao deletar guilda' })
    }
  }

  app.delete('/guilds/:guildId', { preHandler: authenticate }, handleDeleteGuild)
  app.delete('/api/guilds/:guildId', { preHandler: authenticate }, handleDeleteGuild)

  const handleLeaveGuild = async (request, reply) => {
    try {
      const { guildId } = request.params
      const result = await guildProfileService.leaveGuild({
        guildId,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao sair da guilda' })
    }
  }

  app.post('/guilds/:guildId/leave', { preHandler: authenticate }, handleLeaveGuild)
  app.post('/api/guilds/:guildId/leave', { preHandler: authenticate }, handleLeaveGuild)

  // ── Channels Endpoints ────────────────────────────────────────────

  const handleGetChannels = async (request, reply) => {
    try {
      const guildId = request.query?.guildId
      if (!guildId) {
        return reply.code(400).send({ error: 'guildId é obrigatório' })
      }
      const channels = await guildProfileService.getChannels(guildId)
      return reply.code(200).send(channels)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao buscar canais' })
    }
  }

  app.get('/channels', { preHandler: authenticate }, handleGetChannels)
  app.get('/api/channels', { preHandler: authenticate }, handleGetChannels)

  const handleCreateChannel = async (request, reply) => {
    try {
      const guildId = request.query?.guildId || request.body?.guildId
      const { name, type, topic, category } = request.body || {}
      if (!guildId) {
        return reply.code(400).send({ error: 'guildId é obrigatório' })
      }
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'Nome do canal é obrigatório' })
      }

      const channel = await guildProfileService.createChannel({
        guildId,
        name: name.trim(),
        type: type || 'text',
        topic,
        category,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })

      return reply.code(201).send(channel)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao criar canal: ' + (err.message || 'desconhecido') })
    }
  }

  app.post('/channels', { preHandler: authenticate }, handleCreateChannel)
  app.post('/api/channels', { preHandler: authenticate }, handleCreateChannel)

  // ── Invites Endpoints ─────────────────────────────────────────────

  const handleCreateInvite = async (request, reply) => {
    try {
      const { guildId } = request.params
      const { maxUses, expiresInHours } = request.body || {}

      const invite = await guildProfileService.createInvite({
        guildId,
        creatorId: request.user.userId,
        maxUses,
        expiresInHours,
      })

      return reply.code(201).send(invite)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao gerar convite' })
    }
  }

  app.post('/guilds/:guildId/invites', { preHandler: authenticate }, handleCreateInvite)
  app.post('/api/guilds/:guildId/invites', { preHandler: authenticate }, handleCreateInvite)

  const renderInviteHtml = (preview, error = null) => {
    if (error) {
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite Echo - Inválido</title>
  <style>
    body { margin: 0; background: #0b0e14; color: #e1e7ec; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
    .card { background: #12161f; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 36px 28px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.6); }
    .badge { width: 48px; height: 48px; border-radius: 16px; background: rgba(239, 68, 68, 0.1); color: #ef4444; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 22px; font-weight: bold; }
    h1 { font-size: 18px; margin: 0 0 8px; color: #fff; }
    p { font-size: 13px; color: #94a3b8; margin: 0 0 24px; line-height: 1.5; }
    .btn { display: inline-block; background: #0FB9A8; color: #0b0e14; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✕</div>
    <h1>Convite Inválido ou Expirado</h1>
    <p>${error}</p>
    <a href="https://echo.litteris.online" class="btn">Conhecer o Echo</a>
  </div>
</body>
</html>`
    }

    const { name, description, avatarUrl, bannerUrl, channelsCount, code } = preview
    const title = `Você foi convidado para participar de ${name} no Echo`
    const desc = description || `Participe de ${name} e converse em tempo real por texto, voz e vídeo no Echo.`

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Convite Echo</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  ${avatarUrl ? `<meta property="og:image" content="${avatarUrl}">` : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0b0e14; color: #e1e7ec; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px 16px; }
    .card { background: #12161f; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; overflow: hidden; width: 100%; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); position: relative; }
    .banner { height: 130px; background: ${bannerUrl ? `url('${bannerUrl}') center/cover no-repeat` : 'linear-gradient(135deg, rgba(49,46,129,0.7), rgba(88,28,135,0.5), #0b0e14)'}; position: relative; }
    .banner::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, #12161f, transparent); }
    .content { padding: 0 28px 28px; position: relative; text-align: center; }
    .avatar-wrapper { margin: -42px auto 14px; width: 76px; height: 76px; border-radius: 20px; border: 4px solid #12161f; background: #161c28; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; color: #0FB9A8; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; }
    .invite-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #0FB9A8; font-weight: 700; margin-bottom: 6px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #fff; letter-spacing: -0.02em; }
    .desc { font-size: 13px; color: #94a3b8; margin: 0 0 18px; line-height: 1.5; }
    .stats { display: flex; justify-content: center; gap: 16px; margin-bottom: 22px; font-size: 12px; color: #64748b; font-weight: 500; }
    .stats span { display: flex; align-items: center; gap: 4px; }
    .stats strong { color: #0FB9A8; }
    .btn-primary { display: block; background: #0FB9A8; color: #0b0e14; font-weight: 700; text-decoration: none; padding: 13px 20px; border-radius: 14px; font-size: 15px; box-shadow: 0 8px 20px rgba(15,185,168,0.25); cursor: pointer; border: none; width: 100%; transition: all 0.15s; }
    .btn-primary:hover { background: #14d6c3; transform: translateY(-1px); }
    .btn-primary:active { transform: scale(0.98); }
    .btn-secondary { display: block; margin-top: 10px; background: rgba(255,255,255,0.04); color: #e1e7ec; font-weight: 600; text-decoration: none; padding: 11px 20px; border-radius: 14px; font-size: 13px; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; width: 100%; transition: all 0.15s; }
    .btn-secondary:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
    .btn-secondary:active { transform: scale(0.98); }
    .copy-toast { display: none; margin-top: 10px; padding: 8px 12px; background: rgba(15,185,168,0.15); border: 1px solid rgba(15,185,168,0.3); border-radius: 10px; font-size: 12px; color: #0FB9A8; font-weight: 600; }
    .steps-card { margin-top: 20px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; padding: 14px 16px; text-align: left; font-size: 12px; color: #94a3b8; }
    .steps-title { font-weight: 700; color: #e1e7ec; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .steps-card ol { margin-left: 18px; line-height: 1.7; }
    .steps-card ol li strong { color: #fff; }
    .fallback-info { display: none; margin-top: 14px; padding: 10px 14px; background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 12px; font-size: 12px; color: #facc15; text-align: left; line-height: 1.4; }
    .footer-download { margin-top: 18px; font-size: 12px; color: #64748b; }
    .footer-download a { color: #0FB9A8; text-decoration: none; font-weight: 600; }
    .footer-download a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="banner"></div>
    <div class="content">
      <div class="avatar-wrapper">
        ${avatarUrl ? `<img src="${avatarUrl}" class="avatar-img" alt="${name}"/>` : (name[0] || 'G').toUpperCase()}
      </div>
      <div class="invite-label">Você foi convidado para entrar</div>
      <h1>${name}</h1>
      ${desc ? `<p class="desc">${desc}</p>` : ''}
      <div class="stats">
        <span>● <strong>${channelsCount || 1}</strong> ${channelsCount === 1 ? 'canal' : 'canais'}</span>
        <span>🛡️ Comunidade Echo</span>
      </div>

      <button type="button" id="btn-open-app" class="btn-primary">Entrar no Echo Desktop</button>
      <button type="button" id="btn-copy" class="btn-secondary">Copiar Código: <strong style="font-family: monospace; color: #fff;">${code}</strong></button>
      <div id="copy-toast" class="copy-toast">✓ Código copiado! Abra o Echo e cole em "Entrar na guilda"</div>

      <div id="fallback-info" class="fallback-info">
        ⚠️ <strong>O Echo não abriu automaticamente?</strong><br/>
        Clique em "Copiar Código" acima e cole diretamente dentro do app Echo no menu <strong>+ &gt; Entrar em uma guilda</strong>.
      </div>

      <div class="steps-card">
        <div class="steps-title">Como entrar no servidor:</div>
        <ol>
          <li>Abra o <strong>Echo Desktop</strong> no seu computador.</li>
          <li>Na barra lateral esquerda, clique no ícone <strong>+</strong>.</li>
          <li>Selecione <strong>Entrar em uma guilda</strong> e cole o código <strong>${code}</strong>.</li>
        </ol>
      </div>

      <div class="footer-download">
        Ainda não tem o app instalado? <a href="https://github.com/CilentoX/Echo/releases/latest" target="_blank" rel="noopener">Baixar o Echo para Windows</a>
      </div>
    </div>
  </div>

  <script>
    var inviteCode = ${JSON.stringify(code)};
    var btnOpen = document.getElementById('btn-open-app');
    var btnCopy = document.getElementById('btn-copy');
    var copyToast = document.getElementById('copy-toast');
    var fallbackInfo = document.getElementById('fallback-info');

    btnOpen.addEventListener('click', function() {
      // Dispara o deep link sem navegações duplicadas
      window.location.href = 'echo://invite/' + encodeURIComponent(inviteCode);
      setTimeout(function() {
        fallbackInfo.style.display = 'block';
      }, 1500);
    });

    btnCopy.addEventListener('click', function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteCode).then(function() {
          copyToast.style.display = 'block';
          setTimeout(function() { copyToast.style.display = 'none'; }, 3500);
        }).catch(function() {
          prompt('Copie o código do convite:', inviteCode);
        });
      } else {
        prompt('Copie o código do convite:', inviteCode);
      }
    });
  </script>
</body>
</html>`
  }

  const handleGetInvite = async (request, reply) => {
    const acceptsHtml = Boolean(request.headers.accept?.includes('text/html'))
    const acceptsJson = Boolean(request.headers.accept?.includes('application/json'))
    const isHtml = acceptsHtml && !acceptsJson
    try {
      const { code } = request.params
      const result = await guildProfileService.getInvitePreview(code)
      if (result.error) {
        if (isHtml) {
          return reply.code(result.status || 400).type('text/html').send(renderInviteHtml(null, result.error))
        }
        return reply.code(result.status || 400).send({ error: result.error })
      }
      if (isHtml) {
        return reply.code(200).type('text/html').send(renderInviteHtml(result))
      }
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      if (isHtml) {
        return reply.code(500).type('text/html').send(renderInviteHtml(null, 'Erro ao consultar convite'))
      }
      return reply.code(500).send({ error: 'Erro ao consultar convite' })
    }
  }

  app.get('/invite/:code', handleGetInvite)
  app.get('/invites/:code', handleGetInvite)
  app.get('/api/invites/:code', handleGetInvite)

  const handleJoinInvite = async (request, reply) => {
    try {
      const { code } = request.params
      const result = await guildProfileService.joinGuildViaInvite({
        code,
        userId: request.user.userId,
        accessToken: request.user.accessToken,
      })
      if (result.error) {
        return reply.code(result.status || 400).send({ error: result.error })
      }
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao entrar na guilda via convite' })
    }
  }

  app.post('/invites/:code/join', { preHandler: authenticate }, handleJoinInvite)
  app.post('/api/invites/:code/join', { preHandler: authenticate }, handleJoinInvite)

  // Invites management
  const handleListInvites = async (request, reply) => {
    try {
      const { guildId } = request.params
      const invites = await guildProfileService.listGuildInvites(guildId)
      return reply.code(200).send(invites)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao listar convites' })
    }
  }

  const handleDeleteInvite = async (request, reply) => {
    try {
      const { guildId, inviteId } = request.params
      await guildProfileService.deleteGuildInvite(guildId, inviteId)
      return reply.code(200).send({ success: true })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao remover convite' })
    }
  }

  app.get('/guilds/:guildId/invites', { preHandler: authenticate }, handleListInvites)
  app.get('/api/guilds/:guildId/invites', { preHandler: authenticate }, handleListInvites)
  app.delete('/guilds/:guildId/invites/:inviteId', { preHandler: authenticate }, handleDeleteInvite)
  app.delete('/api/guilds/:guildId/invites/:inviteId', { preHandler: authenticate }, handleDeleteInvite)

  // Roles management
  const handleGetRoles = async (request, reply) => {
    try {
      const { guildId } = request.params
      const roles = await guildProfileService.getGuildRoles(guildId)
      return reply.code(200).send(roles)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao listar cargos' })
    }
  }

  const handleCreateRole = async (request, reply) => {
    try {
      const { guildId } = request.params
      const role = await guildProfileService.createGuildRole(guildId, request.body || {})
      return reply.code(201).send(role)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao criar cargo' })
    }
  }

  const handleUpdateRole = async (request, reply) => {
    try {
      const { guildId, roleId } = request.params
      const role = await guildProfileService.updateGuildRole(guildId, roleId, request.body || {})
      return reply.code(200).send(role)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao atualizar cargo' })
    }
  }

  const handleDeleteRole = async (request, reply) => {
    try {
      const { guildId, roleId } = request.params
      await guildProfileService.deleteGuildRole(guildId, roleId)
      return reply.code(200).send({ success: true })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao excluir cargo' })
    }
  }

  app.get('/guilds/:guildId/roles', { preHandler: authenticate }, handleGetRoles)
  app.get('/api/guilds/:guildId/roles', { preHandler: authenticate }, handleGetRoles)
  app.post('/guilds/:guildId/roles', { preHandler: authenticate }, handleCreateRole)
  app.post('/api/guilds/:guildId/roles', { preHandler: authenticate }, handleCreateRole)
  app.patch('/guilds/:guildId/roles/:roleId', { preHandler: authenticate }, handleUpdateRole)
  app.patch('/api/guilds/:guildId/roles/:roleId', { preHandler: authenticate }, handleUpdateRole)
  app.delete('/guilds/:guildId/roles/:roleId', { preHandler: authenticate }, handleDeleteRole)
  app.delete('/api/guilds/:guildId/roles/:roleId', { preHandler: authenticate }, handleDeleteRole)

  // Members data (roles and server nicknames)
  const handleGetMembersData = async (request, reply) => {
    try {
      const { guildId } = request.params
      const data = await guildProfileService.getGuildMembersData(guildId)
      return reply.code(200).send(data)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao carregar dados dos membros' })
    }
  }

  const handleSetMyNickname = async (request, reply) => {
    try {
      const { guildId } = request.params
      const { nickname } = request.body || {}
      const profile = await guildProfileService.setGuildMemberNickname(guildId, request.user.userId, nickname)
      return reply.code(200).send(profile)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao definir apelido' })
    }
  }

  const handleAssignMemberRole = async (request, reply) => {
    try {
      const { guildId, targetUserId, roleId } = request.params
      const result = await guildProfileService.assignGuildMemberRole(guildId, targetUserId, roleId)
      return reply.code(200).send(result)
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao atribuir cargo' })
    }
  }

  const handleRemoveMemberRole = async (request, reply) => {
    try {
      const { guildId, targetUserId, roleId } = request.params
      await guildProfileService.removeGuildMemberRole(guildId, targetUserId, roleId)
      return reply.code(200).send({ success: true })
    } catch (err) {
      request.log.error(err)
      return reply.code(500).send({ error: 'Erro ao remover cargo' })
    }
  }

  app.get('/guilds/:guildId/members-data', { preHandler: authenticate }, handleGetMembersData)
  app.get('/api/guilds/:guildId/members-data', { preHandler: authenticate }, handleGetMembersData)

  app.put('/guilds/:guildId/members/me/nickname', { preHandler: authenticate }, handleSetMyNickname)
  app.put('/api/guilds/:guildId/members/me/nickname', { preHandler: authenticate }, handleSetMyNickname)

  app.post('/guilds/:guildId/members/:targetUserId/roles/:roleId', { preHandler: authenticate }, handleAssignMemberRole)
  app.post('/api/guilds/:guildId/members/:targetUserId/roles/:roleId', { preHandler: authenticate }, handleAssignMemberRole)

  app.delete('/guilds/:guildId/members/:targetUserId/roles/:roleId', { preHandler: authenticate }, handleRemoveMemberRole)
  app.delete('/api/guilds/:guildId/members/:targetUserId/roles/:roleId', { preHandler: authenticate }, handleRemoveMemberRole)
}

