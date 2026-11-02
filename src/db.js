// Production prisma client - imported from @prisma/client in real usage
// This module is mocked in tests via vi.mock('../src/db.js')

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['query'],
});