import { guildProfileService } from "../services/guildProfileService.js";

export async function guildProfileRoutes(fastify, opts) {
  // GET /api/guilds/:guildId/profile
  fastify.get(
    "/:guildId/profile",
    { param: { type: "object", properties: { guildId: { type: "string" } } } },
    async (request, reply) => {
      const { guildId } = request.params;
      const profile = await guildProfileService.getByGuildId(guildId);
      if (!profile) {
        return reply.status(404).send({ error: "Perfil de guilda não encontrado" });
      }
      return profile;
    }
  );

  // PATCH /api/guilds/:guildId/profile
  fastify.patch(
    "/:guildId/profile",
    {
      param: { type: "object", properties: { guildId: { type: "string" } } },
      body: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          bannerUrl: { type: "string", nullable: true },
        },
        required: ["name"],
      },
    },
    async (request, reply) => {
      const { guildId } = request.params;
      const { name, description, avatarUrl, bannerUrl } = request.body;

      // Se não existe, cria primeiro
      let existing = await guildProfileService.getByGuildId(guildId);
      if (!existing) {
        await guildProfileService.upsert({
          id: guildId,
          guildId,
          name,
          description: null,
          avatarUrl: null,
          bannerUrl: null,
          createdBy: "system", // Será preenchido pelo frontend quando disponível
        });
        existing = await guildProfileService.getByGuildId(guildId);
      }

      const updated = await guildProfileService.patch(existing.id, {
        name,
        description,
        avatarUrl,
        bannerUrl,
      });

      return updated;
    }
  );
}
