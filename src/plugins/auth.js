import fp from "fastify-plugin";

export default fp(async (fastify, opts) => {
  const apiKey = process.env.API_KEY;

  fastify.decorateRequest("apiKey", null);

  fastify.addHook("onRequest", async (request, reply) => {
    // Health check não requer autenticação
    if (request.routerPath === "/health") {
      return;
    }

    if (!apiKey) {
      // Se não há API_KEY configurada, permite tudo (dev)
      return;
    }

    const providedKey = request.headers["x-api-key"];
    if (!providedKey || providedKey !== apiKey) {
      return reply.status(401).send({ error: "Não autorizado" });
    }
  });
});
