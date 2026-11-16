import { z } from "zod";
import { parseDaysByType, parseHolidayList } from "../pqrs/deadlines";

const tryParse = (fn: () => unknown) => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};

const databaseUrl = z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"));

// Wompi SANDBOX only: each key must carry its test prefix; production keys are refused even when unused.
const WOMPI_KEYS = {
  WOMPI_PUBLIC_KEY: "pub_test_",
  WOMPI_PRIVATE_KEY: "prv_test_",
  WOMPI_EVENTS_SECRET: "test_events_",
  WOMPI_INTEGRITY_SECRET: "test_integrity_",
} as const;
const wompiKey = (prefix: string) =>
  z
    .string()
    .max(200)
    .refine((value) => !/^(pub_prod_|prv_prod_|prod_)/.test(value), "production keys are refused")
    .refine((value) => value.startsWith(prefix) && value.length > prefix.length + 8, `must start with ${prefix}`)
    .optional();

const DEV_CUSTOMER_CODE_SECRET = "development-customer-code-secret-not-for-production";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Loopback by default: the API is reached through the web proxy, never exposed directly.
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Optional so /health works without a database; /health/ready reports 503 when it is missing.
    DATABASE_URL: databaseUrl.optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    // Number of reverse proxies in front of the API whose X-Forwarded-* headers are trusted. 0 = trust none.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Origin checked on every cookie-authenticated mutation. It is intentionally not inferred from Host.
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    // Public quote intake remains opt-in until the data policy is approved.
    PUBLIC_QUOTE_REQUESTS_ENABLED: z.enum(["true", "false"]).default("false"),
    // PQRS intake stays closed until the agency approves its legal texts and channels.
    PQRS_INTAKE_ENABLED: z.enum(["true", "false"]).default("false"),
    // Default term in business days; per-type overrides, holiday calendar and extra (decreed) holidays are legal
    // decisions — see docs/operations/PQRS_PLAZOS.md. Holidays stay off ("none") until legal confirms them.
    PQRS_RESPONSE_BUSINESS_DAYS: z.coerce.number().int().min(1).max(30).default(15),
    PQRS_RESPONSE_DAYS_BY_TYPE: z
      .string()
      .default("")
      .refine(
        (value) => tryParse(() => parseDaysByType(value)),
        "PETITION|COMPLAINT|CLAIM|SUGGESTION=1..30, comma separated",
      ),
    PQRS_HOLIDAYS: z.enum(["none", "colombia"]).default("none"),
    PQRS_EXTRA_HOLIDAYS: z
      .string()
      .default("")
      .refine((value) => tryParse(() => parseHolidayList(value)), "YYYY-MM-DD dates, comma separated"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    // Required when a staff member provisions or verifies TOTP. Base64-encoded 32-byte AES-256 key.
    MFA_ENCRYPTION_KEY: z.string().min(1).optional(),
    // Keys the customer login code hashes. The development default is refused in production.
    CUSTOMER_CODE_SECRET: z.string().min(32).default(DEV_CUSTOMER_CODE_SECRET),
    MAIL_ADAPTER: z.enum(["disabled", "file", "smtp"]).default("disabled"),
    MAIL_SINK_DIR: z.string().min(1).default(".mail-sink"),
    // smtp://127.0.0.1:1025 for Mailpit in development. May carry credentials: never log it.
    SMTP_URL: z
      .url()
      .refine((value) => value.startsWith("smtp://") || value.startsWith("smtps://"))
      .optional(),
    MAIL_FROM: z.string().min(3).max(200).default("Ricaurte Tours <no-reply@localhost>"),
    // Explicit commercial approval to deliver to a non-loopback SMTP host. Keep "false" otherwise.
    MAIL_REAL_DELIVERY_APPROVED: z.enum(["true", "false"]).default("false"),
    // Online payments. "sandbox_test" is a simulated provider (no money moves) and is refused in production.
    // "wompi_sandbox" talks to Wompi's SANDBOX only (test keys, no real charges), so staging may run it with
    // NODE_ENV=production. See docs/operations/WOMPI_SANDBOX.md.
    PAYMENT_ADAPTER: z.enum(["disabled", "sandbox_test", "wompi_sandbox"]).default("disabled"),
    WOMPI_PUBLIC_KEY: wompiKey(WOMPI_KEYS.WOMPI_PUBLIC_KEY),
    WOMPI_PRIVATE_KEY: wompiKey(WOMPI_KEYS.WOMPI_PRIVATE_KEY),
    WOMPI_EVENTS_SECRET: wompiKey(WOMPI_KEYS.WOMPI_EVENTS_SECRET),
    WOMPI_INTEGRITY_SECRET: wompiKey(WOMPI_KEYS.WOMPI_INTEGRITY_SECRET),
    // In-process outbox dispatcher for development/demo (0 = off; use `notifications:dispatch` from a scheduler).
    NOTIFICATIONS_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).max(3_600_000).default(0),
    SANDBOX_PAYMENT_EVENTS_SECRET: z.string().min(32).default("development-sandbox-events-secret-not-for-production"),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.CUSTOMER_CODE_SECRET !== DEV_CUSTOMER_CODE_SECRET, {
    path: ["CUSTOMER_CODE_SECRET"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.PAYMENT_ADAPTER !== "sandbox_test", {
    path: ["PAYMENT_ADAPTER"],
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_ADAPTER !== "wompi_sandbox") return;
    for (const key of Object.keys(WOMPI_KEYS) as (keyof typeof WOMPI_KEYS)[])
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required by wompi_sandbox" });
  })
  .refine((env) => env.MAIL_ADAPTER !== "smtp" || env.SMTP_URL !== undefined, { path: ["SMTP_URL"] });

export type ApiEnv = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  // An empty value (e.g. "DATABASE_URL=") counts as unset.
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ""));
  const result = envSchema.safeParse(present);
  if (!result.success) {
    // Report variable names only: values may be secrets.
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "UNKNOWN")))];
    throw new Error(`Invalid environment configuration: ${keys.join(", ")}`);
  }
  return result.data;
}

/** Injection token for the validated environment. */
export const ENV = Symbol("ENV");
