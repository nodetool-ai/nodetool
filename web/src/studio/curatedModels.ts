/**
 * The Studio model policy: one curated model per role, stamped onto every new
 * Studio project so beginners never see a model picker. Editing these values
 * is the whole "model management" surface of the product.
 *
 * Ids must exist in the corresponding provider catalog — `nodetool validate`
 * rejects unknown provider/model pairs at run time, so a typo here fails
 * loudly, not silently.
 */

import type {
  ImageModelValue,
  LanguageModelValue,
  VideoModelValue
} from "../stores/ApiTypes";

/** Directs screenplays and drives the in-editor assistants. */
export const STUDIO_DIRECTOR_MODEL: LanguageModelValue = {
  type: "language_model",
  id: "claude-sonnet-5",
  provider: "anthropic",
  name: "Claude Sonnet 5"
};

/** Renders storyboard keyframe stills. */
export const STUDIO_STILL_MODEL: ImageModelValue = {
  type: "image_model",
  id: "fal-ai/flux-1/schnell",
  provider: "fal_ai",
  name: "FLUX.1 Schnell",
  path: ""
};

/** Animates keyframes into shot clips. */
export const STUDIO_CLIP_MODEL: VideoModelValue = {
  type: "video_model",
  id: "fal-ai/kling-video/o1/standard/image-to-video",
  provider: "fal_ai",
  name: "Kling O1 Standard"
};

/**
 * Credits are a beginner-friendly veneer over the prediction ledger:
 * 1 credit = one US cent of provider spend. The grant is a flat prototype
 * allowance; the real product replaces it with purchased balances enforced
 * server-side (see docs/agentic-video-product.md).
 */
export const USD_PER_CREDIT = 0.01;
export const STUDIO_CREDIT_GRANT = 1_000;
