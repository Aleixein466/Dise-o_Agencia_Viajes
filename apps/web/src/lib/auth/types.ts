import { z } from "zod";

export const sessionSchema = z.object({
  user: z.object({ id: z.string(), email: z.string(), displayName: z.string() }),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  mfaRequired: z.boolean(),
  mfaCompleted: z.boolean(),
  csrfToken: z.string(),
});

export type AdminSession = z.infer<typeof sessionSchema>;

/** anonymous = the API answered 401; error = the API is unreachable or answered something unexpected. */
export type SessionResult = { status: "ok"; session: AdminSession } | { status: "anonymous" } | { status: "error" };
