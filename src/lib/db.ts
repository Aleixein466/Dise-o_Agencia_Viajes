import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const db = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
  return db;
}
