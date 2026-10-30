const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const userProfileRoutes = require("../routes/userProfileRoutes");
const guildProfileRoutes = require("../routes/guildProfileRoutes");
const uploadRoutes = require("../routes/uploadRoutes");
const { authenticate } = require("../middleware/auth");
const errorHandler = require("../middleware/errorHandler");

const app = express();

// Middleware de segurança
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());

// Serve arquivos estáticos de upload
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "echo-api" });
});

// Rotas da API (todas requerem autenticação)
app.use("/api", authenticate);

// Perfis de usuário
app.use("/api/profiles", userProfileRoutes);

// Perfis de guilda
app.use("/api/guilds", guildProfileRoutes);

// Upload de arquivos
app.use("/api/upload", uploadRoutes);

// Middleware de erro
app.use(errorHandler);

module.exports = app;
