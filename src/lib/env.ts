import { z } from "zod";

const databaseUrlSchema = z
  .url()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"));

const envSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema.optional(),
    NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
    QUOTE_INTAKE_ENABLED: z.enum(["true", "false"]).default("false"),
    PRIVACY_POLICY_APPROVED: z.enum(["true", "false"]).default("false"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Search indexing is opt-in: only the authorised production deployment sets "true".
    SITE_INDEXING: z.enum(["true", "false"]).default("false"),
    // Where the real client IP comes from. "none" = trust no header (all clients share one bucket).
    // Only set another value when that header is overwritten by a proxy you control.
    CLIENT_IP_SOURCE: z.enum(["none", "x-real-ip", "cf-connecting-ip", "x-forwarded-for"]).default("none"),
    // For x-forwarded-for: number of trusted proxies appending to the header (rightmost entries).
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
    // "memory" is per-instance and only acceptable outside production.
    RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
  })
  .superRefine((env, context) => {
    // Production intake requires a verified client IP source and a shared limiter.
    if (
      env.NODE_ENV === "production" &&
      env.QUOTE_INTAKE_ENABLED === "true" &&
      (env.CLIENT_IP_SOURCE === "none" || env.RATE_LIMIT_STORE === "memory")
    ) {
      context.addIssue({
        code: "custom",
        path: ["QUOTE_INTAKE_ENABLED"],
        message: "Requires trusted client IP and shared rate limit store",
      });
    }
    if (
      env.NODE_ENV === "production" &&
      env.DATABASE_URL !== undefined &&
      (env.DATABASE_URL.includes("REPLACE_WITH") || env.DATABASE_URL.includes("change-me"))
    ) {
      context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Invalid value" });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

let cachedProcessEnv: ServerEnv | undefined;

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (source === process.env && cachedProcessEnv !== undefined) return cachedProcessEnv;

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const invalidKeys = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "UNKNOWN")))];
    throw new Error(`Invalid environment configuration: ${invalidKeys.join(", ")}`);
  }

  if (source === process.env) cachedProcessEnv = result.data;
  return result.data;
}

export function isQuoteIntakeEnabled(env: ServerEnv = getServerEnv()): boolean {
  return (
    env.QUOTE_INTAKE_ENABLED === "true" && env.PRIVACY_POLICY_APPROVED === "true" && env.DATABASE_URL !== undefined
  );
}

/** Fail closed: an invalid environment keeps intake disabled instead of throwing. */
export function quoteIntakeOpen(): boolean {
  try {
    return isQuoteIntakeEnabled();
  } catch {
    return false;
  }
}

export function resetEnvCache(): void {
  cachedProcessEnv = undefined;
}
