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
});
export type Problem = z.infer<typeof problem>;
