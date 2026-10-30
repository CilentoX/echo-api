const expressAsyncHandler = require("express-async-handler");
const UserProfile = require("../models/UserProfile");

/**
 * Controlador de perfis de usuário.
 * Endpoints:
 *   GET    /api/profiles/:userId
 *   PATCH  /api/profiles/:userId
 */

const getProfile = expressAsyncHandler(async (req, res) => {
  const { userId } = req.params;
  const profile = await UserProfile.getByUserId(userId);
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado" });
  }
  res.json(profile);
});

const patchProfile = expressAsyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { avatarUrl, bannerUrl, bio, links } = req.body;

  const updated = await UserProfile.patch(userId, {
    avatarUrl,
    bannerUrl,
    bio,
    links,
  });

  if (!updated) {
    return res.status(404).json({ error: "Perfil não encontrado" });
  }
  res.json(updated);
});

module.exports = { getProfile, patchProfile };
