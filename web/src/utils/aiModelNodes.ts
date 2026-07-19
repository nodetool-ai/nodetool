import { NodeMetadata } from "../stores/ApiTypes";

/**
 * Provider-backed model property types. A node exposing one of these is driven
 * by an AI model (language, image, embedding, TTS, ASR, video). Local/HF model
 * types (llama_model, hf.*, tjs.*) are intentionally excluded: they aren't
 * provider-keyed. Shared source of truth for {@link nodeMetadataUsesAiModel}
 * and `findMissingModelNodes`.
 */
export const PROVIDER_MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

/**
 * True when a node type uses an AI model — either it carries provider unit
 * pricing (fal / kie) or it exposes a provider-backed model property. This is
 * what the cost estimate panel lists; plain data/utility nodes are left out.
 */
export function nodeMetadataUsesAiModel(
  metadata: NodeMetadata | undefined
): boolean {
  if (!metadata) return false;
  if (metadata.fal_unit_pricing || metadata.kie_unit_pricing) return true;
  return (metadata.properties ?? []).some((prop) =>
    prop.type?.type ? PROVIDER_MODEL_TYPES.has(prop.type.type) : false
  );
}

/**
 * Property names that multiply a node's output count (fan-out), in priority
 * order — the first one present with a valid value wins. Confirmed against the
 * generator manifests: `num_images` (280 FAL endpoints), `num_outputs` (33
 * Replicate models), plus `num_samples` and `batch_size` (both FAL + Replicate).
 * `num_frames` is deliberately excluded: it sets the length of a single video,
 * not a batch of separate outputs.
 */
export const FAN_OUT_PROPERTY_NAMES = [
  "num_images",
  "num_outputs",
  "num_samples",
  "batch_size"
] as const;

/**
 * Expected number of outputs a node produces, read from its data. Returns the
 * first fan-out property present with a finite value greater than zero (floored
 * to a whole count); otherwise 1. Conservative by design — an absent or invalid
 * count falls back to a single output so the estimate never over-counts.
 */
export function nodeExpectedQuantity(
  data: Record<string, unknown> | undefined
): number {
  if (!data) return 1;
  for (const name of FAN_OUT_PROPERTY_NAMES) {
    const value = data[name];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return 1;
}
