import { createDbClient, type PrismaClient } from "@ricaurte/db";
import { getServerEnv } from "@/lib/env";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export function getDb() {
  const databaseUrl = getServerEnv().DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  const db = globalForPrisma.prisma ?? createDbClient(databaseUrl);
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
  return db;
}
