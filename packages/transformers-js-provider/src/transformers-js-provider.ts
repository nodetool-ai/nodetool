import { BaseProvider } from "@nodetool/runtime";
import type {
  ASRModel,
  ASRResult,
  EmbeddingModel,
  EncodedAudioResult,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TTSModel
} from "@nodetool/runtime";
import { generateMessage, generateMessages } from "./chat.js";
import { textToSpeechEncoded } from "./tts.js";
import { automaticSpeechRecognition } from "./asr.js";
import { generateEmbedding } from "./embeddings.js";
import {
  discoverASRModels,
  discoverEmbeddingModels,
  discoverLanguageModels,
  discoverTTSModels
} from "./model-discovery.js";

export class TransformersJsProvider extends BaseProvider {
  constructor() {
    super("transformers_js");
  }

  static requiredSecrets(): string[] {
    return [];
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return false;
  }

  // ── Discovery ─────────────────────────────────────────────────────

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return discoverLanguageModels();
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return discoverTTSModels();
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return discoverASRModels();
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return discoverEmbeddingModels();
  }

  // ── Chat ──────────────────────────────────────────────────────────

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    threadId?: string | null;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<Message> {
    return generateMessage(args);
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    threadId?: string | null;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
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
}
