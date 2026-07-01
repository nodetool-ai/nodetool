/**
 * Cookbook demo casts — one synthetic, backend-free recording per recipe in
 * docs/cookbook/patterns.md. Each replays the real graph UI building and running
 * the pattern (running rings, streaming text, progress bars, final media) so the
 * Remotion harness can narrate it into a short video. See demo/src/cookbook.ts
 * for the per-recipe titles, camera beats, and captions.
 */
import type { DemoCast } from "../castTypes";

import { imageEnhancementCast } from "./imageEnhancementCast";
import { imageToStoryCast } from "./imageToStoryCast";
import { moviePosterCast } from "./moviePosterCast";
import { chatWithDocsCast } from "./chatWithDocsCast";
import { flashcardsSqliteCast } from "./flashcardsSqliteCast";
import { summarizeNewslettersCast } from "./summarizeNewslettersCast";
import { audioToImageCast } from "./audioToImageCast";
import { styleTransferCast } from "./styleTransferCast";
import { textToVideoCast } from "./textToVideoCast";
import { imageToVideoCast } from "./imageToVideoCast";
import { talkingAvatarCast } from "./talkingAvatarCast";
import { imageUpscalingCast } from "./imageUpscalingCast";
import { storyboardToVideoCast } from "./storyboardToVideoCast";

export {
  imageEnhancementCast,
  imageToStoryCast,
  moviePosterCast,
  chatWithDocsCast,
  flashcardsSqliteCast,
  summarizeNewslettersCast,
  audioToImageCast,
  styleTransferCast,
  textToVideoCast,
  imageToVideoCast,
  talkingAvatarCast,
  imageUpscalingCast,
  storyboardToVideoCast,
};

/** Every cookbook cast, in cookbook (pattern) order. */
export const cookbookCasts: DemoCast[] = [
  imageEnhancementCast,
  imageToStoryCast,
  moviePosterCast,
  chatWithDocsCast,
  flashcardsSqliteCast,
  summarizeNewslettersCast,
  audioToImageCast,
  styleTransferCast,
  textToVideoCast,
  imageToVideoCast,
  talkingAvatarCast,
  imageUpscalingCast,
  storyboardToVideoCast,
];
