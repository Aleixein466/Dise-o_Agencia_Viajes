import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { PrismaClient } from "@ricaurte/db";
import { ENV, type ApiEnv } from "../config/env";

const READY_TIMEOUT_MS = 2000;

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private client: Promise<PrismaClient> | undefined;

  constructor(@Inject(ENV) private readonly env: ApiEnv) {}

  /** The Prisma client is created lazily so the API boots (and /health answers) without a database. */
  private getClient(): Promise<PrismaClient> | undefined {
    const url = this.env.DATABASE_URL;
    if (url === undefined) return undefined;
    this.client ??= import("@ricaurte/db").then((db) => db.createDbClient(url));
    return this.client;
  }

  /** True only when `SELECT 1` succeeds within the timeout. Never throws and never exposes the cause. */
  async isReady(): Promise<boolean> {
    const pending = this.getClient();
    if (pending === undefined) return false;
    let timer: NodeJS.Timeout | undefined;
    try {
      const client = await pending;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS);
      });
      await Promise.race([client.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch (error) {
      // Log the error class only: driver messages can contain connection details.
      this.logger.warn(`Database readiness check failed (${error instanceof Error ? error.name : "unknown"})`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pending = this.client;
    if (pending === undefined) return;
    this.client = undefined;
    try {
      await (await pending).$disconnect();
    } catch {
      // Shutting down anyway.
    }
  }
}
