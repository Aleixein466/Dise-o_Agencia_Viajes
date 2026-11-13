import { z } from "zod";

const databaseUrl = z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"));

const envSchema = z.object({
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
  // Required when a staff member provisions or verifies TOTP. Base64-encoded 32-byte AES-256 key.
  MFA_ENCRYPTION_KEY: z.string().min(1).optional(),
});

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
