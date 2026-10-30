const express = require("express");
const router = express.Router();
const { getProfile, patchProfile } = require("../controllers/UserProfileController");

router.get("/:userId", getProfile);
router.patch("/:userId", patchProfile);

module.exports = router;
