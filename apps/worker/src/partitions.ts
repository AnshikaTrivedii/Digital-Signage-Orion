import type { PrismaClient } from '@prisma/client';

export async function maintainPopPartitions(prisma: PrismaClient) {
  await prisma.$executeRaw`SELECT orion_ensure_pop_partitions(14, 30)`;
  await prisma.$executeRaw`SELECT orion_drop_old_pop_partitions(30)`;
}
