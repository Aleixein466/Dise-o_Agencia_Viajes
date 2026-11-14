import { createDbClient } from "@ricaurte/db";
import { parseEnv } from "../config/env";
import { MailAdapter } from "./mail";
import { NotificationsService } from "./notifications.service";

const HARD_TIMEOUT_MS = 60_000;
const BATCH = 50;

/** One pass: queue due installment reminders, deliver what is due, exit. Sends only through MAIL_ADAPTER. */
async function main(): Promise<void> {
  const env = parseEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = createDbClient(env.DATABASE_URL);
  try {
    const service = new NotificationsService({ client: async () => client } as never, new MailAdapter(env), env);
    const reminders = await service.enqueueInstallmentReminders(new Date());
    const result = await service.dispatch(BATCH);
    console.log(JSON.stringify({ reminders, ...result }));
  } finally {
    await client.$disconnect();
  }
}

const timer = setTimeout(() => {
  console.error("Notification dispatch timed out");
  process.exit(1);
}, HARD_TIMEOUT_MS);
timer.unref();

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Notification dispatch failed");
    process.exit(1);
  });
