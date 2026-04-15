import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  ProviderId,
  ProviderStreamItem,
  ProviderTool,
  EncodedAudioResult,
  StreamingAudioChunk,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel
} from "./types.js";
import { CostCalculator } from "./cost-calculator.js";
import type { UsageInfo } from "./cost-calculator.js";
import { getTracer } from "../telemetry.js";
import { SpanStatusCode } from "@opentelemetry/api";
import { createLogger, getDefaultAssetsPath } from "@nodetool/config";

const log = createLogger("nodetool.runtime.provider");

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
          span.setAttributes({
            "llm.provider": this.provider,
            "llm.model": args.model,
            "llm.request.message_count": args.messages.length,
            "llm.request.tools_count": args.tools?.length ?? 0,
            "llm.request.max_tokens": args.maxTokens ?? 0,
            "llm.request.stream": false
          });
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
            span.end();
          }
        }
      );
    };

    let result: Message | undefined;
    let error: string | undefined;
    try {
      result = await doCall();
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
        tokens_input: null,
        tokens_output: null,
        cost: null,
        duration_ms: Date.now() - startTime,
        error: error ?? null,
        timestamp: new Date(startTime).toISOString()
      });
    }
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
    const tracer = getTracer();

    let fullResponse = "";
    const collectedToolCalls: Array<{
      id: string;
      name: string;
      args: unknown;
    }> = [];
    let error: string | undefined;

    try {
      const source = tracer
        ? this._tracedStream(args, tracer)
        : this.generateMessages(args);

      for await (const item of source) {
        // Accumulate text content from chunks
        if ("type" in item && (item as { type: string }).type === "chunk") {
          const chunk = item as { content?: string };
          if (chunk.content) fullResponse += chunk.content;
        }
        // Collect tool calls
        if ("id" in item && "name" in item && "args" in item) {
          const tc = item as { id: string; name: string; args: unknown };
          collectedToolCalls.push({ id: tc.id, name: tc.name, args: tc.args });
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
        tokens_input: null,
        tokens_output: null,
        cost: null,
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
    span.setAttributes({
      "llm.provider": this.provider,
      "llm.model": args.model,
      "llm.request.message_count": args.messages.length,
      "llm.request.tools_count": args.tools?.length ?? 0,
      "llm.request.max_tokens": args.maxTokens ?? 0,
      "llm.request.stream": true
    });
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
      const filePath = `${getDefaultAssetsPath()}/${key}`;
      try {
        const bytes = await readFile(filePath);
        const ext = key.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      } catch {
        return `http://127.0.0.1:${process.env.PORT ?? 7777}${uri}`;
      }
    }

    return uri;
  }
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf"
};
