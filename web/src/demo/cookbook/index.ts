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
import { textToVideoCast } from "./textToVideoCast";
import { imageToVideoCast } from "./imageToVideoCast";
import { talkingAvatarCast } from "./talkingAvatarCast";
import { imageUpscalingCast } from "./imageUpscalingCast";
import { briefToCutCast } from "./briefToCutCast";
import { shotFanOutCast } from "./shotFanOutCast";
import { entityCastCast } from "./entityCastCast";
import { scriptVoiceCast } from "./scriptVoiceCast";
import { sketchVariantsCast } from "./sketchVariantsCast";
import { variantFanOutCast } from "./variantFanOutCast";
import { derivativesCast } from "./derivativesCast";
import { codeGlueCast } from "./codeGlueCast";

/** Every cookbook cast. The creative-pattern casts follow docs/cookbook/patterns.md. */
export const cookbookCasts: DemoCast[] = [
  imageEnhancementCast,
  imageToStoryCast,
  moviePosterCast,
  chatWithDocsCast,
  flashcardsSqliteCast,
  summarizeNewslettersCast,
  audioToImageCast,
  textToVideoCast,
  imageToVideoCast,
  talkingAvatarCast,
  imageUpscalingCast,
  briefToCutCast,
  shotFanOutCast,
  entityCastCast,
  scriptVoiceCast,
  sketchVariantsCast,
  variantFanOutCast,
  derivativesCast,
  codeGlueCast,
];
