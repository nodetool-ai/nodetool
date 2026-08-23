/**
 * PythonProvider — bridges Python-only providers (HuggingFace Local, MLX)
 * through the local Python stdio bridge.
 *
 * Each instance wraps a specific Python provider ID (e.g. "huggingface", "mlx")
 * and proxies all BaseProvider methods through the bridge.
 */

import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  ImageModel,
  TTSModel,
  ModelAdapterInfo,
  ASRModel,
  EmbeddingModel,
  VideoModel,
  Message,
  ProviderTool,
  ProviderStreamItem,
  StreamingAudioChunk,
  TextToImageParams,
  ImageToImageParams,
  TextToSpeechParams
} from "./types.js";
import type { PythonBridgeBase } from "../python-bridge-base.js";
import { isRecord, isString } from "../type-predicates.js";

type PythonProviderOptions = Record<string, unknown> & {
  _id: string;
  _bridge: PythonBridgeBase;
  /** Provider id understood by the Python worker when the public id is aliased. */
  _bridgeProviderId?: string;
};

function parseModelAdapter(value: unknown): ModelAdapterInfo | undefined {
  if (!isRecord(value)) return undefined;
  const state = value.state;
  if (
    state !== "installed" &&
    state !== "missing_dependency" &&
    state !== "unknown"
  ) {
    return undefined;
  }

  const rawArtifact = value.artifact_ref;
  const artifactRef = isRecord(rawArtifact)
    ? {
        source: "huggingface" as const,
        repoId: String(rawArtifact.repo_id ?? ""),
        revision: isString(rawArtifact.revision)
          ? rawArtifact.revision
          : undefined,
        path: isString(rawArtifact.path) ? rawArtifact.path : undefined
      }
    : undefined;

  return {
    state,
    reasonCode: isString(value.reason_code) ? value.reason_code : undefined,
    reason: isString(value.reason) ? value.reason : undefined,
    artifactRef:
      artifactRef && artifactRef.repoId.length > 0 ? artifactRef : undefined
  };
}

export class PythonProvider extends BaseProvider {
  private _bridge: PythonBridgeBase;
  private _pythonProviderId: string;
  private _secrets: Record<string, string>;

  constructor(
    providerId: string,
    bridge: PythonBridgeBase,
    secrets?: Record<string, string>
  );
  constructor(options: PythonProviderOptions);
  constructor(
    providerIdOrOptions: string | PythonProviderOptions,
    bridge?: PythonBridgeBase,
    secrets: Record<string, string> = {}
  ) {
    if (isString(providerIdOrOptions)) {
      super(providerIdOrOptions);
      if (!bridge) {
        throw new Error("PythonProvider requires a bridge instance");
      }
      this._bridge = bridge;
      this._pythonProviderId = providerIdOrOptions;
      this._secrets = secrets;
      return;
    }

    const { _id, _bridge, _bridgeProviderId, ...rawSecrets } =
      providerIdOrOptions;
    super(_id);
    this._bridge = _bridge;
    this._pythonProviderId = _bridgeProviderId ?? _id;
    this._secrets = Object.fromEntries(
      Object.entries(rawSecrets).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
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
    const models = await this._getModels("tts");
    return models.map((raw) => {
      const model = raw as Record<string, unknown>;
      return {
        id: String(model.id ?? ""),
        name: String(model.name ?? model.id ?? ""),
        provider: String(model.provider ?? this._pythonProviderId),
        voices: Array.isArray(model.voices)
          ? model.voices.map(String)
          : undefined,
        capabilities: Array.isArray(model.capabilities)
          ? model.capabilities.map(String)
          : undefined,
        languages: Array.isArray(model.languages)
          ? model.languages.map(String)
          : undefined,
        sampleRate:
          typeof model.sample_rate === "number" ? model.sample_rate : undefined,
        requiresReferenceText:
          typeof model.requires_reference_text === "boolean"
            ? model.requires_reference_text
            : undefined,
        adapter: parseModelAdapter(model.adapter)
      };
    });
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
    const models = await this._bridge.getProviderModels(
      this._pythonProviderId,
      modelType,
      this._secrets
    );
    // The public provider id may be an alias (notably `huggingface-local`) so
    // selections route back through this bridge adapter instead of colliding
    // with a built-in remote provider that uses the worker's original id.
    return models.map((model) => ({
      ...model,
      provider: this.provider
    }));
  }

  // ── Chat completion ───────────────────────────────────────────────

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const wireMessages = args.messages.map(serializeMessage);
    const requestPayload = {
      provider: this._pythonProviderId,
      messages: wireMessages,
      model: args.model,
      options: {
        secrets: this._secrets,
        tools: args.tools,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        top_p: args.topP
      }
    };
    this.recordRequestPayload(requestPayload);
    const result = await this._bridge.providerGenerate(
      this._pythonProviderId,
      wireMessages,
      args.model,
      requestPayload.options
    );
    return deserializeMessage(result);
  }

  async *generateMessages(args: {
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
  }): AsyncGenerator<ProviderStreamItem> {
    const wireMessages = args.messages.map(serializeMessage);

    const requestPayload = {
      provider: this._pythonProviderId,
      messages: wireMessages,
      model: args.model,
      options: {
        secrets: this._secrets,
        tools: args.tools,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        top_p: args.topP
      }
    };
    this.recordRequestPayload(requestPayload);
    for await (const chunk of this._bridge.providerStream(
      this._pythonProviderId,
      wireMessages,
      args.model,
      requestPayload.options
    )) {
      if (chunk.type === "tool_call") {
        yield {
          id: chunk.id as string,
          name: chunk.name as string,
          args: (chunk.args as Record<string, unknown>) ?? {}
        };
      } else {
        yield {
          type: "chunk",
          content: (chunk.content as string) ?? "",
          done: (chunk.done as boolean) ?? false
        };
      }
    }
  }

  // ── Media generation ──────────────────────────────────────────────

  async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this._bridge.providerTextToImage(
      this._pythonProviderId,
      { ...params },
      this._secrets
    );
  }

  async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    return this._bridge.providerImageToImage(
      this._pythonProviderId,
      images[0] ?? new Uint8Array(),
      { ...params },
      this._secrets
    );
  }

  async *textToSpeech(
    args: TextToSpeechParams
  ): AsyncGenerator<StreamingAudioChunk> {
    for await (const audioBytes of this._bridge.providerTTS(
      this._pythonProviderId,
      args.text,
      args.model,
      {
        voice: args.voice,
        speed: args.speed,
        reference_audio: args.referenceAudio,
        reference_text: args.referenceText,
        language: args.language,
        instructions: args.instructions,
        secrets: this._secrets
      }
    )) {
      // audioBytes is a msgpack-decoded Uint8Array — generally a view into a
      // larger buffer at a non-zero byteOffset. `new Int16Array(bytes.buffer)`
      // ignores the offset (reinterpreting unrelated bytes) and throws when the
      // buffer length or offset isn't 2-aligned. Copy to guarantee alignment,
      // trimming a trailing odd byte.
      const even = audioBytes.byteLength - (audioBytes.byteLength % 2);
      const copy = audioBytes.slice(0, even);
      yield { samples: new Int16Array(copy.buffer, copy.byteOffset, even / 2) };
    }
  }

  async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<import("./types.js").ASRResult> {
    return this._bridge.providerASR(
      this._pythonProviderId,
      args.audio,
      args.model,
      {
        language: args.language,
        prompt: args.prompt,
        temperature: args.temperature,
        word_timestamps: args.word_timestamps,
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

function serializeMessage(msg: Message) {
  const result: Record<string, unknown> = { role: msg.role };

  if (isString(msg.content)) {
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
