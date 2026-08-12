/**
 * The names of the creative critique tools — the judging half of a generate →
 * look → critique → revise loop, plus the taste pair that persists what the
 * user prefers.
 *
 * The judges live in the `media` capability module
 * (`../capabilities/media.ts`) and the taste pair in the `style` module
 * (`../capabilities/style.ts`). A belt reaches all five by name.
 */

/** Names of the creative critique tools. */
export const CREATIVE_CRITIQUE_TOOL_NAMES = [
  "critique_image",
  "compare_images",
  "score_image_adherence",
  "record_style_preference",
  "get_style_profile"
] as const;
