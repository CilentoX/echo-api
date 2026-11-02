export default {
  userToken: {
    create: async () => {},
    findUnique: async () => ({ userId, accessToken, deviceId }),
    upsert: async () => {},
    deleteMany: async () => {},
  },
  $disconnect: async () => {},
  $transaction: async (fn) => fn(),
  $use: () => {},
}