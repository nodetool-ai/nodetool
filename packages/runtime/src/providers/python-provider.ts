/**
 * PythonProvider — bridges Python-only providers (HuggingFace Local, MLX)
 * through the PythonBridge WebSocket protocol.
 *
 * Each instance wraps a specific Python provider ID (e.g. "huggingface", "mlx")
 * and proxies all BaseProvider methods through the bridge.
 */

import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  ImageModel,
  TTSModel,
  ASRModel,
  EmbeddingModel,
  VideoModel,
  Message,
  ProviderTool,
  ProviderStreamItem,
  StreamingAudioChunk,
  TextToImageParams,
  ImageToImageParams,
  ToolCall
} from "./types.js";
import type { Chunk } from "@nodetool/protocol";
import type { PythonBridge } from "../python-bridge.js";

export class PythonProvider extends BaseProvider {
  private _bridge: PythonBridge;
  private _pythonProviderId: string;
  private _secrets: Record<string, string>;

  constructor(
    providerId: string,
    bridge: PythonBridge,
    secrets: Record<string, string> = {}
  ) {
    super(providerId);
    this._bridge = bridge;
    this._pythonProviderId = providerId;
    this._secrets = secrets;
  }

  static requiredSecrets(): string[] {
    return [];
  }

  // ── Model discovery ───────────────────────────────────────────────

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this._getModels("language") as Promise<LanguageModel[]>;
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return this._getModels("image") as Promise<ImageModel[]>;
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this._getModels("tts") as Promise<TTSModel[]>;
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return this._getModels("asr") as Promise<ASRModel[]>;
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return this._getModels("embedding") as Promise<EmbeddingModel[]>;
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return this._getModels("video") as Promise<VideoModel[]>;
  }

  private async _getModels(modelType: string): Promise<unknown[]> {
    return this._bridge.getProviderModels(
      this._pythonProviderId,
      modelType,
      this._secrets
    );
  }

  // ── Chat completion ───────────────────────────────────────────────

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const wireMessages = args.messages.map(serializeMessage);
    const result = await this._bridge.providerGenerate(
      this._pythonProviderId,
      wireMessages,
      args.model,
      {
        secrets: this._secrets,
        tools: args.tools,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        top_p: args.topP,
        response_format: args.responseFormat
      }
    );
    return deserializeMessage(result);
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const wireMessages = args.messages.map(serializeMessage);

    for await (const chunk of this._bridge.providerStream(
      this._pythonProviderId,
      wireMessages,
      args.model,
      {
        secrets: this._secrets,
        tools: args.tools,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        top_p: args.topP,
        response_format: args.responseFormat
      }
    )) {
      if (chunk.type === "tool_call") {
        yield {
          id: chunk.id as string,
          name: chunk.name as string,
          args: (chunk.args as Record<string, unknown>) ?? {}
        } as ToolCall;
      } else {
        yield {
          type: "chunk",
          content: (chunk.content as string) ?? "",
          done: (chunk.done as boolean) ?? false
        } as Chunk;
      }
    }
  }

  // ── Media generation ──────────────────────────────────────────────

  async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this._bridge.providerTextToImage(
      this._pythonProviderId,
      params as unknown as Record<string, unknown>,
      this._secrets
    );
  }

  async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    return this._bridge.providerImageToImage(
      this._pythonProviderId,
      image,
      params as unknown as Record<string, unknown>,
      this._secrets
    );
  }

  async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<StreamingAudioChunk> {
    for await (const audioBytes of this._bridge.providerTTS(
      this._pythonProviderId,
      args.text,
      args.model,
      { voice: args.voice, speed: args.speed, secrets: this._secrets }
    )) {
      yield { samples: new Int16Array(audioBytes.buffer) };
    }
  }

  async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
  }): Promise<string> {
    return this._bridge.providerASR(
      this._pythonProviderId,
      args.audio,
      args.model,
      {
        language: args.language,
        prompt: args.prompt,
        temperature: args.temperature,
        secrets: this._secrets
      }
    );
  }

  async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    return this._bridge.providerEmbedding(
      this._pythonProviderId,
      args.text,
      args.model,
      args.dimensions
    );
  }
}

// ── Wire format helpers ───────────────────────────────────────────────

function serializeMessage(msg: Message): Record<string, unknown> {
  const result: Record<string, unknown> = { role: msg.role };

  if (typeof msg.content === "string") {
    result.content = msg.content;
  } else if (Array.isArray(msg.content)) {
    result.content = msg.content;
  } else if (msg.content != null) {
    result.content = String(msg.content);
  }

  if (msg.toolCalls) {
    result.tool_calls = msg.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args
    }));
  }

  if (msg.toolCallId) {
    result.tool_call_id = msg.toolCallId;
  }

  return result;
}

function deserializeMessage(wire: Record<string, unknown>): Message {
  const msg: Message = {
    role: wire.role as Message["role"]
  };

  if (wire.content != null) {
    msg.content = wire.content as string;
  }

  if (wire.tool_calls) {
    msg.toolCalls = (wire.tool_calls as Array<Record<string, unknown>>).map(
      (tc) => ({
        id: tc.id as string,
        name: tc.name as string,
        args: (tc.args as Record<string, unknown>) ?? {}
      })
    );
  }

  return msg;
}
