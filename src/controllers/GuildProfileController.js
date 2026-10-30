const expressAsyncHandler = require("express-async-handler");
const GuildProfile = require("../models/GuildProfile");

/**
 * Controlador de perfis de guilda.
 * Endpoints:
 *   GET    /api/guilds/:guildId/profile
 *   PATCH  /api/guilds/:guildId/profile
 */

const getGuildProfile = expressAsyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const profile = await GuildProfile.getByGuildId(guildId);
  if (!profile) {
    return res.status(404).json({ error: "Perfil de guilda não encontrado" });
  }
  res.json(profile);
});

const patchGuildProfile = expressAsyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const { name, description, avatarUrl, bannerUrl } = req.body;

  const updated = await GuildProfile.patch(guildId, {
    name,
    description,
    avatarUrl,
    bannerUrl,
  });

  if (!updated) {
    return res.status(404).json({ error: "Perfil de guilda não encontrado" });
  }
  res.json(updated);
});

module.exports = { getGuildProfile, patchGuildProfile };
