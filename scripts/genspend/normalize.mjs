/**
 * Model-name normalization for the GenSpend sync's matcher.
 *
 * The comparison-key helpers (`normalize`, `stripVendor`, `stripTasks`,
 * `modelKeys`) live in `scripts/rankings/model-keys.mjs`, shared with the
 * model-rankings sync, and are re-exported here so every price-sync import is
 * unchanged. What stays here is GenSpend-specific: which tasks bill separately
 * and which capability flag a task implies.
 */

import {
  MAX_SUFFIX_WORDS,
  modelKeys,
  normalize,
  stripTasks,
  stripVendor
} from "../rankings/model-keys.mjs";

export { modelKeys, normalize, stripTasks, stripVendor };

/**
 * Tasks that are a different product from the generation GenSpend prices.
 * An upscaler or a lip-sync endpoint bills on its own basis, so it must never
 * inherit the model's generation price.
 */
export const NON_GENERATION_TASKS = new Set([
  "upscale",
  "lip-sync",
  "lipsync",
  "voice-clone",
  "speech-to-text",
  "video-to-video"
]);

/** True when a model id/title names a task priced separately from generation. */
export function isNonGenerationTask(...values) {
  for (const value of values) {
    const key = normalize(value);
    if (!key) continue;
    const parts = key.split("-");
    for (let n = 1; n <= Math.min(2, parts.length); n += 1) {
      if (NON_GENERATION_TASKS.has(parts.slice(-n).join("-"))) return true;
    }
  }
  return false;
}

/**
 * Task suffix → the capability flag GenSpend publishes for it. A model whose
 * capabilities refute a task must not be priced on an endpoint for that task:
 * `bria-3-2` reports `i2i: false`, so its per-image price never lands on an
 * image-to-image endpoint.
 *
 * `edit` maps to `i2i` because that is what an edit endpoint is — an image in,
 * an image out.
 */
const CAPABILITY_BY_TASK = {
  "text-to-image": "t2i",
  "image-to-image": "i2i",
  edit: "i2i",
  inpaint: "i2i",
  outpaint: "i2i",
  "text-to-video": "t2v",
  "image-to-video": "i2v",
  "reference-to-video": "r2v",
  "first-last-frame-to-video": "i2v",
  "video-to-video": "v2v"
};

/** The capability flag a model id/title implies, or null when it names no task. */
export function capabilityForModelId(...values) {
  for (const value of values) {
    const key = normalize(value);
    if (!key) continue;
    const parts = key.split("-");
    for (let n = MAX_SUFFIX_WORDS; n >= 1; n -= 1) {
      const suffix = parts.slice(-n).join("-");
      if (CAPABILITY_BY_TASK[suffix]) return CAPABILITY_BY_TASK[suffix];
    }
  }
  return null;
}

