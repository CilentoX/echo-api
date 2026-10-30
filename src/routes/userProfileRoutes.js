import { userProfileService } from "../services/userProfileService.js";

export async function userProfileRoutes(fastify, opts) {
  // GET /api/profiles/:userId
  fastify.get(
    "/:userId",
    { param: { type: "object", properties: { userId: { type: "string" } } } },
    async (request, reply) => {
      const { userId } = request.params;
      const profile = await userProfileService.getByUserId(userId);
      if (!profile) {
        return reply.status(404).send({ error: "Perfil não encontrado" });
      }
      return profile;
    }
  );

  // PATCH /api/profiles/:userId
  fastify.patch(
    "/:userId",
    {
      param: { type: "object", properties: { userId: { type: "string" } } },
      body: {
        type: "object",
        properties: {
          avatarUrl: { type: "string", nullable: true },
          bannerUrl: { type: "string", nullable: true },
          bio: { type: "string", nullable: true },
          links: { type: "array" },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { avatarUrl, bannerUrl, bio, links } = request.body;

      // Se não existe, cria primeiro
      let existing = await userProfileService.getByUserId(userId);
      if (!existing) {
        await userProfileService.upsert({
          id: userId,
          userId,
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
          links: [],
        });
        existing = await userProfileService.getByUserId(userId);
      }

      const updated = await userProfileService.patch(existing.id, {
        avatarUrl,
        bannerUrl,
        bio,
        links,
      });

      return updated;
    }
  );
}
