import { z } from "zod";

// ── Fonts list response ──────────────────────────────────────────
// The fonts tRPC router returns a sorted unique list of system font family
// names (no file extensions).
export const listOutput = z.object({
  fonts: z.array(z.string())
});
export type ListOutput = z.infer<typeof listOutput>;
