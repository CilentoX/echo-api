const express = require("express");
const router = express.Router();
const { getGuildProfile, patchGuildProfile } = require("../controllers/GuildProfileController");

router.get("/:guildId/profile", getGuildProfile);
router.patch("/:guildId/profile", patchGuildProfile);

module.exports = router;
