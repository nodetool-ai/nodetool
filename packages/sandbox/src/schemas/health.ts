import { z } from "zod";

export const HealthOutput = z.object({
  ok: z.literal(true),
  version: z.string(),
  uptime_seconds: z.number().nonnegative(),
  workspace: z.string()
});
export type HealthOutput = z.infer<typeof HealthOutput>;
