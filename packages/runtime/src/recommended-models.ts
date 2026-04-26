/**
 * Curated list of recommended models surfaced by the models API and CLI.
 *
 * Kept here (outside the websocket package) so CLI/tooling can import the
 * list without pulling in a Fastify server.
 */

import type { UnifiedModel } from "@nodetool/protocol";
import type { ProviderId } from "./providers/index.js";

export interface RecommendedUnifiedModel extends UnifiedModel {
  modality: "language" | "image" | "tts" | "asr" | "video";
  task?:
    | "text_generation"
    | "embedding"
    | "text_to_image"
    | "image_to_image"
    | "text_to_video"
    | "image_to_video";
  provider?: ProviderId;
  /** Optional list of platforms this entry is valid on. Undefined = all. */
  supported_systems?: Array<"darwin" | "linux" | "windows">;
}

export const RECOMMENDED_MODELS: RecommendedUnifiedModel[] = [
  {
    id: "gpt-4o-mini",
    type: "language_model",
    name: "GPT-4o mini",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "text_generation",
    provider: "openai"
  },
  {
    id: "claude-3-5-sonnet-latest",
    type: "language_model",
    name: "Claude 3.5 Sonnet",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "text_generation",
    provider: "anthropic"
  },
  {
    id: "text-embedding-3-small",
    type: "embedding_model",
    name: "Text Embedding 3 Small",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "embedding",
    provider: "openai"
  },
  {
    id: "voyage-3.5",
    type: "embedding_model",
    name: "Voyage 3.5",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "embedding",
    provider: "voyage"
  },
  {
    id: "embed-v4.0",
    type: "embedding_model",
    name: "Cohere Embed v4.0",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "embedding",
    provider: "cohere"
  },
  {
    id: "jina-embeddings-v3",
    type: "embedding_model",
    name: "Jina Embeddings v3",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "language",
    task: "embedding",
    provider: "jina"
  },
  {
    id: "gpt-image-2",
    type: "image_model",
    name: "GPT Image 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "image",
    task: "text_to_image",
    provider: "openai"
  },
  {
    id: "gpt-image-2",
    type: "image_model",
    name: "GPT Image 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "image",
    task: "image_to_image",
    provider: "openai"
  },
  {
    id: "whisper-1",
    type: "asr_model",
    name: "Whisper",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "asr",
    provider: "openai"
  },
  {
    id: "tts-1",
    type: "tts_model",
    name: "TTS 1",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "tts",
    provider: "openai"
  },
  {
    id: "sora-2",
    type: "video_model",
    name: "Sora 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "video",
    task: "text_to_video",
    provider: "openai"
  },
  {
    id: "sora-2",
    type: "video_model",
    name: "Sora 2",
    repo_id: null,
    path: null,
    downloaded: false,
    modality: "video",
    task: "image_to_video",
    provider: "openai"
  }
];
