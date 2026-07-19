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
