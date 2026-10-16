import { BaseProvider } from "@nodetool-ai/runtime";
import { loadTransformers } from "@nodetool-ai/transformers-js-nodes";
import type {
  ASRModel,
  ASRResult,
  EmbeddingModel,
  EncodedAudioResult,
  EstimateDepthParams,
  ImageModel,
  ImageSegmentationMask,
  LanguageModel,
  Message,
  MusicModel,
  ProviderCapability,
  ProviderStreamItem,
  RemoveBackgroundParams,
  RerankModel,
  RerankParams,
  RerankResult,
  SegmentImageParams,
  TextToMusicParams,
  TTSModel
} from "@nodetool-ai/runtime";
import { generateMessage, generateMessages } from "./chat.js";
import { textToSpeechEncoded } from "./tts.js";
import { textToMusic } from "./music.js";
import { automaticSpeechRecognition } from "./asr.js";
import { generateEmbedding } from "./embeddings.js";
import {
  estimateDepth,
  removeBackground,
  segmentImage,
  textToImage,
  upscaleImage
} from "./image-ops.js";
import { rerank } from "./rerank.js";
import {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverImageModels,
  discoverLanguageModels,
  discoverMusicModels,
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
      "text_to_music",
      "automatic_speech_recognition",
      "generate_embedding",
      "remove_background",
      "estimate_depth",
      "segment_image",
      "text_to_image",
      "upscale_image",
      "rerank"
    ];
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    // Chat models write tool calls as text. See tool-calls.ts.
    return true;
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

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return this.discover(discoverMusicModels);
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

  // ── Music ─────────────────────────────────────────────────────────

  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    return textToMusic(params);
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

  override async textToImage(
    params: Parameters<BaseProvider["textToImage"]>[0]
  ): Promise<Uint8Array> {
    return textToImage({
      prompt: params.prompt,
      model: params.model.id,
      signal: params.signal
    });
  }

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

  override async segmentImage(
    image: Uint8Array,
    params: SegmentImageParams
  ): Promise<ImageSegmentationMask[]> {
    params.signal?.throwIfAborted();
    if (params.prompt || params.points?.length || params.box) {
      throw new Error(
        "Transformers.js segmentation models segment the whole image and take no prompt, points or box."
      );
    }
    return segmentImage({
      image,
      model: params.model.id,
      maxMasks: params.maxMasks,
      minConfidence: params.minConfidence
    });
  }

  override async upscaleImage(
    image: Uint8Array,
    params: Parameters<BaseProvider["upscaleImage"]>[1]
  ): Promise<Uint8Array> {
    return upscaleImage({ image, model: params.model.id });
  }

  // ── Reranking ─────────────────────────────────────────────────────

  override async rerank(params: RerankParams): Promise<RerankResult[]> {
    return rerank(params);
  }
}
