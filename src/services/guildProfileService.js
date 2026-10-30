import { prisma } from "../lib/prisma.js";

export const guildProfileService = {
  async getByGuildId(guildId) {
    return prisma.guildProfile.findUnique({
      where: { guildId },
    });
  },

  async upsert({ id, guildId, name, description, avatarUrl, bannerUrl, createdBy }) {
    return prisma.guildProfile.upsert({
      where: { guildId },
      update: {
        name,
        description,
        avatarUrl,
        bannerUrl,
      },
      create: {
        guildId,
        name,
        description,
        avatarUrl,
        bannerUrl,
        createdBy,
      },
    });
  },

  async patch(id, fields) {
    const { name, description, avatarUrl, bannerUrl } = fields;
    return prisma.guildProfile.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bannerUrl !== undefined && { bannerUrl }),
      },
    });
  },

  async delete(id) {
    return prisma.guildProfile.delete({
      where: { id },
    });
  },
};
