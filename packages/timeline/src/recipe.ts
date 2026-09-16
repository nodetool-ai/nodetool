import type { ClipVersion, TimelineClip, VideoGenerationRecipe } from "./types.js";

export type ReplayRecipeResult =
  | { ok: true; recipe: VideoGenerationRecipe }
  | { ok: false; reason: string };

export type VideoGenerationRecipeCaptureResult =
  | { ok: true; recipe: VideoGenerationRecipe }
  | { ok: false; reason: string };

/** Capture the direct text-to-video inputs before a generation is dispatched. */
export function captureVideoGenerationRecipe(
  clip: TimelineClip,
  promptOverride?: string
): VideoGenerationRecipeCaptureResult {
  if (clip.mediaType !== "video" || clip.bindingKind !== "text-to-video") {
    return {
      ok: false,
      reason: "New take requires a direct text-to-video clip."
    };
  }
  const prompt = (promptOverride ?? clip.prompt ?? "").trim();
  if (!prompt) return { ok: false, reason: "New take requires a prompt." };
  if (!clip.provider || !clip.provider.trim() || !clip.model || !clip.model.trim()) {
    return {
      ok: false,
      reason: "New take requires the original provider and model."
    };
  }
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) {
    return { ok: false, reason: "New take requires a positive clip duration." };
  }
  if (!clip.aspectRatio?.trim() && !clip.resolution?.trim()) {
    return {
      ok: false,
      reason: "New take requires the original framing settings."
    };
  }
  type MutableRecipeFields = {
    -readonly [Key in keyof VideoGenerationRecipe]: VideoGenerationRecipe[Key]
  };
  const recipeFields: MutableRecipeFields = {
    schemaVersion: 1,
    task: "text_to_video",
    prompt,
    provider: clip.provider,
    model: clip.model,
    durationMs: clip.durationMs
  };
  const negativePrompt = clip.negativePrompt?.trim();
  if (negativePrompt) recipeFields.negativePrompt = negativePrompt;
  const aspectRatio = clip.aspectRatio?.trim();
  if (aspectRatio) recipeFields.aspectRatio = aspectRatio;
  const resolution = clip.resolution?.trim();
  if (resolution) recipeFields.resolution = resolution;
  if (clip.width !== undefined) recipeFields.width = clip.width;
  if (clip.height !== undefined) recipeFields.height = clip.height;
  if (clip.strength !== undefined) recipeFields.strength = clip.strength;
  if (clip.numInferenceSteps !== undefined) {
    recipeFields.numInferenceSteps = clip.numInferenceSteps;
  }
  if (clip.seed !== undefined) recipeFields.seed = clip.seed;
  return { ok: true, recipe: Object.freeze(recipeFields) };
}

/**
 * Return a replayable recipe only for a complete generated text-to-video take.
 * Legacy takes and native video-edit takes remain valid, but are unavailable
 * for recipe replay because their original inputs were not captured here.
 */
export function getReplayRecipe(take: ClipVersion): ReplayRecipeResult {
  if (take.source === "imported") {
    return { ok: false, reason: "Imported takes do not have a generation recipe." };
  }
  if (take.mediaEdit?.action === "video_edit") {
    return { ok: false, reason: "Video-edit takes cannot be replayed as New take." };
  }
  const recipe = take.generationRecipe;
  if (recipe === undefined) {
    return { ok: false, reason: "This take has no known generation recipe." };
  }
  if (
    take.source !== "generated" ||
    recipe.task !== "text_to_video" ||
    recipe.schemaVersion !== 1
  ) {
    return { ok: false, reason: "This take does not contain a known text-to-video recipe." };
  }
  if (!recipe.prompt.trim() || !recipe.provider.trim() || !recipe.model.trim()) {
    return { ok: false, reason: "The generation recipe is missing prompt, provider, or model." };
  }
  if (!Number.isFinite(recipe.durationMs) || recipe.durationMs <= 0) {
    return { ok: false, reason: "The generation recipe is missing a positive duration." };
  }
  if (!recipe.aspectRatio?.trim() && !recipe.resolution?.trim()) {
    return { ok: false, reason: "The generation recipe is missing framing settings." };
  }
  return { ok: true, recipe };
}
