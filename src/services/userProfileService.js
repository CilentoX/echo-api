import { prisma } from "../lib/prisma.js";

export const userProfileService = {
  async getByUserId(userId) {
    return prisma.userProfile.findUnique({
      where: { userId },
    });
  },

  async upsert({ id, userId, avatarUrl, bannerUrl, bio, links }) {
    return prisma.userProfile.upsert({
      where: { userId },
      update: {
        avatarUrl,
        bannerUrl,
        bio,
        links: links ?? [],
      },
      create: {
        userId,
        avatarUrl,
        bannerUrl,
        bio,
        links: links ?? [],
      },
    });
  },

  async patch(id, fields) {
    const { avatarUrl, bannerUrl, bio, links } = fields;
    return prisma.userProfile.update({
      where: { id },
      data: {
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(bio !== undefined && { bio }),
        ...(links !== undefined && { links }),
      },
    });
  },

  async delete(id) {
    return prisma.userProfile.delete({
      where: { id },
    });
  },
};
