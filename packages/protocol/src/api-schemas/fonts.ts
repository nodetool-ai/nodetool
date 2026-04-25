import { z } from "zod";

// ── Fonts list response ──────────────────────────────────────────
// Mirrors `handleFontsRequest` in skills-api.ts — returns a sorted unique
// list of system font family names (no file extensions).
export const listOutput = z.object({
  fonts: z.array(z.string())
});
export type ListOutput = z.infer<typeof listOutput>;
