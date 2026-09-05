/**
 * Shared fixture constants for `provider-contract.test.ts` and the cassette
 * generator (`scripts/generate-provider-contract-cassettes.ts`). Keeping the
 * request shapes here means the suite and the generator can never drift: both
 * hash the exact same `{messages, model}` requests.
 */
import type { Message } from "../../src/providers/types.js";

/** The single chat turn every contract cassette is recorded against. */
export const CONTRACT_MESSAGES: Message[] = [
  { role: "user", content: "Say hello in exactly one word." }
];

/** Model id for the "happy path" streaming/cost/shape interaction. */
export const CONTRACT_MODEL = "contract-test-model";

/** Model id whose recorded interaction is a scripted 429 (rate limit). */
export const CONTRACT_MODEL_RATE_LIMIT = "contract-test-model-error-429";

/** Model id whose recorded interaction is a scripted 401 (auth failure). */
export const CONTRACT_MODEL_AUTH_ERROR = "contract-test-model-error-401";

/**
 * Providers registered in `provider-registry.ts` whose `generateMessage`/
 * `generateMessages` unconditionally throw "does not support chat
 * generation" — they exist for a different modality entirely (image, video,
 * TTS, embeddings, 3D, upscaling). `CassetteProvider` only records the chat
 * surface, so there is no contract cassette to author for them; the
 * exemption is enforced by a dedicated test (`rejects chat cleanly`) rather
 * than a silent skip. Verified against each provider's source in
 * packages/runtime/src/providers/*.ts (grep for "does not support chat").
 */
export const MEDIA_ONLY_EXEMPTIONS: Record<string, string> = {
  nodetool:
    "Delegating provider (NodeTool's managed models): it makes no wire calls " +
    "of its own — chat routes to the delegate named in NODETOOL_MODELS, whose " +
    "own cassette covers the contract. An id outside the curated catalog " +
    "(like the contract model) rejects cleanly.",
  fal_ai: "Image/video generation provider; generateMessage(s) always throws.",
  comfy_cloud:
    "Credentials-only provider for the lib.comfy nodes (they submit ComfyUI " +
    "graphs to cloud.comfy.org); generateMessage(s) always throws.",
  elevenlabs: "Text-to-speech provider; generateMessage(s) always throws.",
  topaz: "Image upscaling provider; generateMessage(s) always throws.",
  reve: "Image generation provider; generateMessage(s) always throws.",
  meshy: "3D asset generation provider; generateMessage(s) always throws.",
  rodin: "3D asset generation provider; generateMessage(s) always throws.",
  cohere: "Embeddings/rerank provider; generateMessage(s) always throws.",
  voyage: "Embeddings provider; generateMessage(s) always throws.",
  jina: "Embeddings/rerank provider; generateMessage(s) always throws."
};
