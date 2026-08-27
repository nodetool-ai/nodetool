/**
 * The names of the creative critique tools — the judging half of a generate →
 * look → critique → revise loop.
 *
 * They live in the `media` capability module (`../capabilities/media.ts`); a
 * belt reaches all three by name.
 */

/** Names of the creative critique tools. */
export const CREATIVE_CRITIQUE_TOOL_NAMES = [
  "critique_image",
  "compare_images",
  "score_image_adherence"
] as const;
