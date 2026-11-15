import { z } from "zod";

/** RFC 9457 problem details, served as application/problem+json. */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export const problem = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Correlates the response with server logs. */
  requestId: z.string().optional(),
  /** Extension member: stable machine-readable error code (e.g. SEASON_OVERLAP); never a free-text message. */
  code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
    .optional(),
  /** Extension member: id of the record a 409 conflicts with. */
  conflictId: z.uuid().optional(),
});
export type Problem = z.infer<typeof problem>;
