import { z } from "zod";

const databaseUrlSchema = z.url().refine(
  (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
);

const envSchema = z.object({
  DATABASE_URL: databaseUrlSchema.optional(),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  QUOTE_INTAKE_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVACY_POLICY_APPROVED: z.enum(["true", "false"]).default("false"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}).superRefine((env, context) => {
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
  return env.QUOTE_INTAKE_ENABLED === "true" &&
    env.PRIVACY_POLICY_APPROVED === "true" &&
    env.DATABASE_URL !== undefined;
}

export function resetEnvCache(): void {
  cachedProcessEnv = undefined;
}
