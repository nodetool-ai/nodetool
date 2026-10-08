import { BaseProvider } from "@nodetool-ai/runtime";
import { loadTransformers } from "@nodetool-ai/transformers-js-nodes";
import type {
  ASRModel,
  ASRResult,
  EmbeddingModel,
  EncodedAudioResult,
  EstimateDepthParams,
  ImageModel,
  LanguageModel,
  Message,
  ProviderCapability,
  ProviderStreamItem,
  RemoveBackgroundParams,
  RerankModel,
  RerankParams,
  RerankResult,
  TTSModel
} from "@nodetool-ai/runtime";
import { generateMessage, generateMessages } from "./chat.js";
import { textToSpeechEncoded } from "./tts.js";
import { automaticSpeechRecognition } from "./asr.js";
import { generateEmbedding } from "./embeddings.js";
import { estimateDepth, removeBackground } from "./image-ops.js";
import { rerank } from "./rerank.js";
import {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverImageModels,
  discoverLanguageModels,
  discoverRerankModels,
  discoverTTSModels
} from "./model-discovery.js";

export class TransformersJsProvider extends BaseProvider {
  constructor() {
    super("transformers_js");
  }

  static requiredSecrets(): string[] {
    return [];
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_speech",
      "automatic_speech_recognition",
      "generate_embedding",
      "remove_background",
      "estimate_depth",
      "rerank"
    ];
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return false;
  }

  // ── Discovery ─────────────────────────────────────────────────────

  /** The optional `@huggingface/transformers` runtime may not be installed. */
  override async unavailableReason(): Promise<string | null> {
    try {
      await loadTransformers();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** List models only when the runtime that would run them is installed. */
  private async discover<T>(list: () => Promise<T[]>): Promise<T[]> {
    return (await this.unavailableReason()) ? [] : list();
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.discover(discoverLanguageModels);
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.discover(discoverTTSModels);
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return this.discover(discoverASRModels);
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return this.discover(discoverEmbeddingModels);
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.discover(discoverImageModels);
  }

  override async getAvailableRerankModels(): Promise<RerankModel[]> {
    return this.discover(discoverRerankModels);
  }

  // ── Chat ──────────────────────────────────────────────────────────

  override async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    return generateMessage(args);
  }

  override async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    yield* generateMessages(args);
  }

  // ── TTS ───────────────────────────────────────────────────────────

  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    return textToSpeechEncoded(args);
  }

  // ── ASR ───────────────────────────────────────────────────────────

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    return automaticSpeechRecognition(args);
  }

  // ── Embeddings ────────────────────────────────────────────────────

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    return generateEmbedding(args);
  }

  // ── Image ─────────────────────────────────────────────────────────

  override async removeBackground(
    image: Uint8Array,
    params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    return removeBackground({ image, model: params.model.id });
  }

  override async estimateDepth(
    image: Uint8Array,
    params: EstimateDepthParams
  ): Promise<Uint8Array> {
    params.signal?.throwIfAborted();
    return estimateDepth({ image, model: params.model.id });
  }

  // ── Reranking ─────────────────────────────────────────────────────

  override async rerank(params: RerankParams): Promise<RerankResult[]> {
    return rerank(params);
  }
}
