import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp, createAdapter } from "./app.factory";
import { parseEnv } from "./config/env";
import { NotificationsService } from "./notifications/notifications.service";

// The single local .env lives at the monorepo root. Existing variables win; a missing file is fine (CI, containers).
function loadRootEnv(): void {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {
    // No .env file: rely on the process environment.
  }
}

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const env = parseEnv();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(env), createAdapter(env), {
    logger: ["error", "warn"],
  });
  await configureApp(app);
  // SIGTERM/SIGINT drain in-flight requests, close the server and disconnect the database.
  app.enableShutdownHooks();
  await app.listen(env.PORT, env.HOST);
  if (env.NOTIFICATIONS_DISPATCH_INTERVAL_MS > 0) {
    const notifications = app.get(NotificationsService);
    let running = false;
    // One pass at a time; a failed pass is reported without details (rows record their own error class).
    setInterval(() => {
      if (running) return;
      running = true;
      notifications
        .dispatch(20)
        .catch(() => console.error("notification dispatch pass failed"))
        .finally(() => {
          running = false;
        });
    }, env.NOTIFICATIONS_DISPATCH_INTERVAL_MS).unref();
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "API failed to start");
  process.exit(1);
});
