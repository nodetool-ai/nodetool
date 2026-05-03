import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageTo3DParams,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  Model3D,
  ProviderId,
  ProviderStreamItem,
  ProviderTool,
  EncodedAudioResult,
  StreamingAudioChunk,
  TextTo3DParams,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel
} from "./types.js";
import { CostCalculator } from "./cost-calculator.js";
import type { UsageInfo } from "./cost-calculator.js";
import { getTracer } from "../telemetry.js";
import {
  withUsageCapture,
  setLastUsage,
  consumeLastUsage,
  peekLastUsage,
  createUsageSlot,
  type LlmUsage
} from "../tracing-helpers.js";
import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { createLogger, getAssetFilePath } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.provider");

/**
 * Capability names a provider can expose. These correspond to the `capability`
 * strings consumed by client-side filters like `useImageModelProviders`,
 * `useTTSProviders`, etc.
 */
export type ProviderCapability =
  | "generate_message"
  | "generate_messages"
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "generate_embedding"
  | "text_to_3d"
  | "image_to_3d";

/**
 * Derive a provider's capability set by checking which optional `getAvailable*`
 * methods it overrides on its prototype. Every provider can always generate
 * messages; image/video/TTS/ASR/embedding are advertised only when the concrete
 * class overrides the matching base method.
 *
 * Shared by `packages/websocket/src/models-api.ts` (REST leftover) and the
 * `models` tRPC router so both report identical capabilities for the same
 * provider instance.
 */
export function providerCapabilities(
  instance: BaseProvider
): ProviderCapability[] {
  const capabilities: ProviderCapability[] = [
    "generate_message",
    "generate_messages"
  ];
  if (
    instance.getAvailableImageModels !==
    BaseProvider.prototype.getAvailableImageModels
  ) {
    capabilities.push("text_to_image", "image_to_image");
  }
  if (
    instance.getAvailableVideoModels !==
    BaseProvider.prototype.getAvailableVideoModels
  ) {
    capabilities.push("text_to_video", "image_to_video");
  }
  if (
    instance.getAvailableTTSModels !==
    BaseProvider.prototype.getAvailableTTSModels
  ) {
    capabilities.push("text_to_speech");
  }
  if (
    instance.getAvailableASRModels !==
    BaseProvider.prototype.getAvailableASRModels
  ) {
    capabilities.push("automatic_speech_recognition");
  }
  if (
    instance.getAvailableEmbeddingModels !==
    BaseProvider.prototype.getAvailableEmbeddingModels
  ) {
    capabilities.push("generate_embedding");
  }
  if (
    instance.getAvailable3DModels !==
    BaseProvider.prototype.getAvailable3DModels
  ) {
    // Providers that expose 3D models are assumed to support both task types;
    // individual `textTo3D` / `imageTo3D` calls will throw if not implemented.
    capabilities.push("text_to_3d", "image_to_3d");
  }
  return capabilities;
}

export abstract class BaseProvider {
  readonly provider: ProviderId;
  private _cost = 0;
  private _emitMessage: ((msg: unknown) => void) | null = null;

  setMessageEmitter(fn: (msg: unknown) => void): void {
    this._emitMessage = fn;
  }

  protected emitMessage(msg: unknown): void {
    if (this._emitMessage) this._emitMessage(msg);
  }

  protected constructor(provider: ProviderId) {
    this.provider = provider;
  }

  static requiredSecrets(): string[] {
    return [];
  }

  getContainerEnv(): Record<string, string> {
    return {};
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  trackUsage(model: string, usage: UsageInfo): number {
    const cost = CostCalculator.calculate(model, usage, this.provider);
    this._cost += cost;
    setLastUsage({
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cachedInputTokens: usage.cachedTokens,
      cost
    });
    log.debug("Cost tracked", { model, cost, total: this._cost });
    return cost;
  }

  /** Alias for getTotalCost() — mirrors Python's BaseProvider.cost property. */
  get cost(): number {
    return this._cost;
  }

  getTotalCost(): number {
    return this._cost;
  }

  /**
   * Log a provider call for cost tracking.
   * Base implementation logs to debug; subclasses or callers may persist to a Prediction model.
   */
  async logProviderCall(args: {
    userId: string;
    provider: string;
    model: string;
    cost: number;
    workflowId?: string | null;
  }): Promise<void> {
    log.debug("Provider call", {
      userId: args.userId,
      provider: args.provider,
      model: args.model,
      cost: args.cost,
      workflowId: args.workflowId ?? null
    });
  }

  resetCost(): void {
    this._cost = 0;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [];
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [];
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [];
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [];
  }

  /**
   * 3D **generation** models exposed by this provider (e.g. Meshy's `meshy-4`,
   * Rodin's `rodin-regular`). Override on providers that can synthesize 3D
   * assets from text and/or images.
   */
  async getAvailable3DModels(): Promise<Model3D[]> {
    return [];
  }

  abstract generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    /** Force the model to call a specific tool by name, or "any" to require any tool call. */
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    /** Optional thread/conversation identifier for session-based providers. */
    threadId?: string | null;
    /** Optional callback for native tool execution (used by providers with in-process MCP). */
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    /** Optional signal to abort the request. */
    signal?: AbortSignal;
  }): Promise<Message>;

  abstract generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    /** Force the model to call a specific tool by name, or "any" to require any tool call. */
    toolChoice?: string | "any";
    maxTokens?: number;
    /**
     * Upper bound on internal agentic turns for providers that handle
     * multi-turn tool execution within a single call (e.g. claude_agent).
     * Ignored by providers that delegate the loop to the caller.
     */
    maxTurns?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    /** Optional thread/conversation identifier for session-based providers. */
    threadId?: string | null;
    /** Optional callback for native tool execution (used by providers with in-process MCP). */
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    /** Optional signal to abort the request. */
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem>;

  /** Traced wrapper around generateMessage. Use this instead of calling generateMessage directly. */
  async generateMessageTraced(
    args: Parameters<this["generateMessage"]>[0]
  ): Promise<Message> {
    const startTime = Date.now();
    const tracer = getTracer();

    const doCall = async (): Promise<Message> => {
      if (!tracer) return this.generateMessage(args);
      return tracer.startActiveSpan(
        `llm.chat ${this.provider}/${args.model}`,
        async (span) => {
          this.applyLlmRequestAttributes(span, args, false);
          try {
            const result = await this.generateMessage(args);
            const content =
              typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content);
            span.setAttributes({
              "llm.response.role": result.role,
              "llm.response.content": content.slice(0, 2000),
              "llm.response.tool_calls_count": result.toolCalls?.length ?? 0
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err)
            });
            span.recordException(err as Error);
            throw err;
          } finally {
            applyUsageAttributes(span, peekLastUsage());
            span.end();
          }
        }
      );
    };

    let result: Message | undefined;
    let error: string | undefined;
    let usage: LlmUsage | null = null;
    try {
      // withUsageCapture creates a per-call AsyncLocalStorage slot so
      // trackUsage() in the provider hands its numbers back to us.
      result = await withUsageCapture(async () => {
        const r = await doCall();
        usage = consumeLastUsage();
        return r;
      });
      return result;
    } catch (err) {
      error = String(err);
      throw err;
    } finally {
      this.emitMessage({
        type: "llm_call",
        node_id: "",
        provider: this.provider,
        model: args.model,
        messages: args.messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        response: result?.content ?? null,
        tool_calls:
          result?.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args
          })) ?? null,
        tokens_input: usage ? (usage as LlmUsage).inputTokens : null,
        tokens_output: usage ? (usage as LlmUsage).outputTokens : null,
        cost: usage ? ((usage as LlmUsage).cost ?? null) : null,
        duration_ms: Date.now() - startTime,
        error: error ?? null,
        timestamp: new Date(startTime).toISOString()
      });
    }
  }

  private applyLlmRequestAttributes(
    span: Span,
    args: { messages: unknown[]; model: string; tools?: unknown[]; maxTokens?: number; temperature?: number },
    streaming: boolean
  ): void {
    span.setAttributes({
      "llm.provider": this.provider,
      "llm.model": args.model,
      "gen_ai.system": this.provider,
      "gen_ai.request.model": args.model,
      "gen_ai.operation.name": streaming ? "chat.stream" : "chat",
      "llm.request.message_count": args.messages.length,
      "llm.request.tools_count": args.tools?.length ?? 0,
      "llm.request.stream": streaming,
      // Only emit max_tokens / temperature when the caller actually set them —
      // a literal 0 is a valid value and shouldn't be confused with "unset".
      ...(args.maxTokens !== undefined && {
        "llm.request.max_tokens": args.maxTokens
      }),
      ...(args.temperature !== undefined && {
        "llm.request.temperature": args.temperature
      })
    });
  }

  /** Traced wrapper around generateMessages. Use this instead of calling generateMessages directly. */
  async *generateMessagesTraced(
    args: Parameters<this["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    const startTime = Date.now();
    log.info("LLM call", {
      provider: this.provider,
      model: args.model,
      toolCount: (args as Record<string, unknown>).tools
        ? ((args as Record<string, unknown>).tools as unknown[]).length
        : 0,
      hasOnToolCall: !!(args as Record<string, unknown>).onToolCall
    });

    let fullResponse = "";
    const collectedToolCalls: Array<{
      id: string;
      name: string;
      args: unknown;
    }> = [];
    let error: string | undefined;

    // Per-call usage slot survives across the generator's yields by wrapping
    // each `next()` call in `runInSlot`.
    const { runInSlot, getUsage } = createUsageSlot();
    const tracer = getTracer();
    const source = tracer
      ? this._tracedStream(args, tracer)
      : this.generateMessages(args);
    let exhausted = false;

    try {
      while (true) {
        const result = await runInSlot(() => source.next());
        if (result.done) {
          exhausted = true;
          break;
        }
        const item = result.value;
        if ("type" in item && (item as { type: string }).type === "chunk") {
          const chunk = item as { content?: string };
          if (chunk.content) fullResponse += chunk.content;
        }
        if ("id" in item && "name" in item && "args" in item) {
          const tc = item as { id: string; name: string; args: unknown };
          collectedToolCalls.push({
            id: tc.id,
            name: tc.name,
            args: tc.args
          });
        }
        yield item;
      }
      log.debug("LLM call complete", {
        provider: this.provider,
        model: args.model
      });
    } catch (err) {
      error = String(err);
      throw err;
    } finally {
      // If the consumer cancelled early (broke out of for-await, threw, or
      // called return()), give the underlying generator a chance to close
      // so _tracedStream's finally runs and the LLM stream span ends.
      if (!exhausted) {
        await runInSlot(() =>
          source.return?.(undefined as never) ?? Promise.resolve({ done: true, value: undefined } as IteratorResult<ProviderStreamItem>)
        ).catch(() => {});
      }
      const usage = getUsage();
      this.emitMessage({
        type: "llm_call",
        node_id: "",
        provider: this.provider,
        model: args.model,
        messages: args.messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        response: fullResponse || null,
        tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
        tokens_input: usage?.inputTokens ?? null,
        tokens_output: usage?.outputTokens ?? null,
        cost: usage?.cost ?? null,
        duration_ms: Date.now() - startTime,
        error: error ?? null,
        timestamp: new Date(startTime).toISOString()
      });
    }
  }

  /** Internal: wrap generateMessages with OTel span */
  private async *_tracedStream(
    args: Parameters<this["generateMessages"]>[0],
    tracer: ReturnType<typeof getTracer> & object
  ): AsyncGenerator<ProviderStreamItem> {
    const span = tracer.startSpan(`llm.stream ${this.provider}/${args.model}`);
    this.applyLlmRequestAttributes(span, args, true);
    let chunkCount = 0;
    try {
      for await (const item of this.generateMessages(args)) {
        chunkCount++;
        yield item;
      }
      span.setAttributes({ "llm.response.chunk_count": chunkCount });
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      throw err;
    } finally {
      applyUsageAttributes(span, peekLastUsage());
      span.end();
    }
  }

  async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support textToImage`);
  }

  /**
   * Generate multiple images from a text prompt.
   *
   * Default implementation calls textToImage() sequentially as a fallback.
   * Providers that support native batch generation (e.g. FAL with num_images)
   * should override this for efficiency.
   */
  async textToImages(
    params: TextToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (let i = 0; i < numImages; i++) {
      results.push(await this.textToImage(params));
    }
    return results;
  }

  async imageToImage(
    _image: Uint8Array,
    _params: ImageToImageParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support imageToImage`);
  }

  /**
   * Generate multiple image-to-image results in one logical call.
   *
   * Default implementation calls imageToImage() sequentially as a fallback.
   * Providers that support native batch generation should override this.
   */
  async imageToImages(
    image: Uint8Array,
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (let i = 0; i < numImages; i++) {
      results.push(await this.imageToImage(image, params));
    }
    return results;
  }

  async *textToSpeech(_args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    /**
     * Requested output container. Providers that stream raw PCM may ignore
     * this hint; the caller is responsible for wrapping/encoding the result.
     */
    audioFormat?: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    yield* [];
    throw new Error(`${this.provider} does not support textToSpeech`);
  }

  /**
   * Override this for providers that return fully-encoded audio (FLAC, WAV,
   * MP3) instead of raw PCM samples. Returns null by default, meaning the
   * caller should fall back to the streaming PCM `textToSpeech()` path.
   *
   * Providers that honor `audioFormat` should return audio in that container
   * when possible and fall back to their default when the format is not
   * supported. The returned `mimeType` reflects the actual bytes produced.
   */
  async textToSpeechEncoded(_args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    return null;
  }

  async automaticSpeechRecognition(_args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<import("./types.js").ASRResult> {
    throw new Error(
      `${this.provider} does not support automaticSpeechRecognition`
    );
  }

  async textToVideo(_params: TextToVideoParams): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support textToVideo`);
  }

  async imageToVideo(
    _image: Uint8Array,
    _params: ImageToVideoParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support imageToVideo`);
  }

  /**
   * Generate a 3D asset from a text prompt. Returns the encoded asset bytes
   * (typically GLB). Providers that support 3D generation should override.
   */
  async textTo3D(_params: TextTo3DParams): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support textTo3D`);
  }

  /**
   * Generate a 3D asset from a single reference image. Returns the encoded
   * asset bytes (typically GLB). Providers that support 3D generation should
   * override.
   */
  async imageTo3D(
    _image: Uint8Array,
    _params: ImageTo3DParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support imageTo3D`);
  }

  async generateEmbedding(_args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    throw new Error(`${this.provider} does not support generateEmbedding`);
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return msg.includes("context length") || msg.includes("maximum context");
  }

  /**
   * Check if an error is a rate limit error (HTTP 429).
   * Subclasses may override for provider-specific detection.
   */
  isRateLimitError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /429|rate.?limit|too many requests/i.test(msg);
  }

  /**
   * Check if an error is an authentication error (HTTP 401/403).
   * Subclasses may override for provider-specific detection.
   */
  isAuthError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /401|403|unauthorized|forbidden|invalid.*api.*key|authentication/i.test(
      msg
    );
  }

  protected parseToolCallArgs(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw !== "string") {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  protected buildToolCall(id: string, name: string, args: unknown): ToolCall {
    return {
      id,
      name,
      args: this.parseToolCallArgs(args)
    };
  }

  /**
   * Resolve a URI to a `data:` URI that providers can consume directly.
   *
   * - `file://...`        → read from disk, return `data:<mime>;base64,…`
   * - `/api/storage/<k>`  → read from getDefaultAssetsPath()/<k> (legacy fallback)
   * - Everything else     → returned unchanged (http/https/data: pass through)
   */
  protected async resolveUri(uri: string): Promise<string> {
    const { readFile } = await import("node:fs/promises");

    if (uri.startsWith("file://")) {
      try {
        const { fileURLToPath } = await import("node:url");
        const filePath = fileURLToPath(uri);
        const bytes = await readFile(filePath);
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      } catch {
        return uri;
      }
    }

    // Legacy: old messages stored with browser-facing /api/storage/ path
    if (uri.startsWith("/api/storage/")) {
      const key = uri.slice("/api/storage/".length);
      try {
        const bytes = await readFile(getAssetFilePath(key));
        const ext = key.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      } catch {
        // Remote deployment: file not local, fall back to absolute HTTP
        return `http://127.0.0.1:${process.env.PORT ?? 7777}${uri}`;
      }
    }

    return uri;
  }
}

/** Attach gen_ai usage attributes to a span (no-op if usage is null). */
function applyUsageAttributes(span: Span, usage: LlmUsage | null): void {
  if (!usage) return;
  span.setAttributes({
    "gen_ai.usage.input_tokens": usage.inputTokens,
    "gen_ai.usage.output_tokens": usage.outputTokens,
    "gen_ai.usage.total_tokens": usage.inputTokens + usage.outputTokens,
    ...(usage.cachedInputTokens !== undefined && {
      "gen_ai.usage.cached_input_tokens": usage.cachedInputTokens
    }),
    ...(usage.cost !== undefined && { "gen_ai.usage.cost_credits": usage.cost })
  });
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf"
};
