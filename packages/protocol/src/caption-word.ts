import { z } from "zod";

/** Word timing in milliseconds relative to the associated audio or clip. */
export const captionWord = z.object({
  word: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  kind: z.enum(["word", "filler", "pause"]).optional(),
  confidence: z.number().min(0).max(1).optional()
});
export type CaptionWord = z.infer<typeof captionWord>;
