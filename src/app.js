import fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import authPlugin from "../plugins/auth.js";
import userProfileRoutes from "../routes/userProfileRoutes.js";
import guildProfileRoutes from "../routes/guildProfileRoutes.js";
import uploadRoutes from "../routes/uploadRoutes.js";

const app = fastify({
  logger: process.env.NODE_ENV === "development",
});

// Plugins de segurança
app.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-Key"],
});

app.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Desabilita CSP para permitir uploads simples
});

app.register(fastifyMultipart, {
  limits: {
    fields: 10,
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1,
    headerPairs: 2000,
  },
});

// Plugin de autenticação
app.register(authPlugin);

// Rotas (todas sob /api, exceto /health)
app.get("/health", async () => {
  return { status: "ok", service: "echo-api" };
});

app.register(userProfileRoutes, { prefix: "/api/profiles" });
app.register(guildProfileRoutes, { prefix: "/api/guilds" });
app.register(uploadRoutes, { prefix: "/api/upload" });

// Serve arquivos estáticos de upload
app.get("/uploads/:filename", async (request, reply) => {
  const { filename } = request.params;
  return reply.sendFile(filename, process.env.UPLOAD_DIR || "./src/uploads");
});

export default app;
