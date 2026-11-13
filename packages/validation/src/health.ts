import { z } from "zod";

export const healthResponse = z.object({ status: z.literal("ok") }).strict();
export type HealthResponse = z.infer<typeof healthResponse>;
