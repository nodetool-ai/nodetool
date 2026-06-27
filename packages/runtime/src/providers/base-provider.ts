import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageTo3DParams,
  ImageToImageParams,
  InpaintingParams,
  ImageToVideoParams,
  LanguageModel,
  LipSyncParams,
  Message,
  MessageContent,
  Model3D,
  MusicModel,
  ProviderId,
  ProviderSession,
  ProviderStreamItem,
  ProviderTool,
  EncodedAudioResult,
  TextToMusicParams,
  RelightImageParams,
  RemoveBackgroundParams,
  StreamingAudioChunk,
  TextTo3DParams,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  UpscaleImageParams,
  VectorizeImageParams,
  VideoModel,
  VideoToVideoParams
} from "./types.js";
import { isProviderSessionUpdate, isProviderMessageEvent } from "./types.js";
import { CostCalculator } from "./cost-calculator.js";
import type { UsageInfo } from "./cost-calculator.js";
import { getTracer } from "../telemetry.js";
import {
  withUsageCapture,
  withModalityCapture,
  setLastUsage,
  setLastRequest,
  consumeLastUsage,
  peekLastUsage,
  peekLastRequest,
  createUsageSlot,
  type LlmUsage
} from "../tracing-helpers.js";
import { logProviderRequestFailure } from "./provider-request-log.js";
import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import { createLogger, getAssetFilePath } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.provider");

/**
 * Collapse a tool result to plain text. Used by string-only tool channels (the
 * legacy inline callback, the Claude Agent SDK's MCP tools) when a tool returns
 * {@link MessageContent} blocks they can't render — keep the text, drop images.
 */
export function toolResultToText(result: string | MessageContent[]): string {
  if (typeof result === "string") return result;
  const text = result
    .filter(
      (c): c is MessageContent & { type: "text"; text: string } =>
        c.type === "text"
    )
    .map((c) => c.text)
    .join("\n");
  return text || "[image result]";
}

/**
 * Split a tool result into the text that belongs in the `role:"tool"` message
 * and, when the result carries images, a follow-up `role:"user"` message that
 * actually carries the pixels.
 *
 * Most providers cannot render an image inside a tool-result message — OpenAI
 * stringifies it to a base64 *text* blob (massive token blowup, and the model
 * never sees an image). An image content block is only honored on a user (or
 * assistant) message, so image-bearing tool results must ride a user message.
 * Returns `imageMessage: null` for plain (text/no-image) results.
 */
export function splitToolResultImages(result: string | MessageContent[]): {
  toolContent: string | MessageContent[];
  imageMessage: Message | null;
} {
  if (typeof result === "string") {
    return { toolContent: result, imageMessage: null };
  }
  const images = result.filter((c) => c.type === "image_url");
  if (images.length === 0) {
    return { toolContent: result, imageMessage: null };
  }
  const texts = result.filter(
    (c): c is MessageContent & { type: "text"; text: string } =>
      c.type === "text"
  );
  const note =
    texts.map((c) => c.text).join("\n") ||
    "Returned an image, shown in the next message.";
  return {
    toolContent: note,
    imageMessage: { role: "user", content: [...texts, ...images] }
  };
}

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
  | "inpainting"
  | "upscale_image"
  | "remove_background"
  | "relight_image"
  | "vectorize_image"
  | "text_to_video"
  | "image_to_video"
  | "video_to_video"
  | "lip_sync"
  | "text_to_speech"
  | "text_to_music"
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
  // The remaining task types don't have their own model-discovery method —
  // they reuse Image/VideoModel (advertised via each model's `supportedTasks`).
  // Advertise the provider-level capability when the concrete class overrides
  // the matching task method.
  if (instance.inpaint !== BaseProvider.prototype.inpaint) {
    capabilities.push("inpainting");
  }
  if (instance.upscaleImage !== BaseProvider.prototype.upscaleImage) {
    capabilities.push("upscale_image");
  }
  if (instance.removeBackground !== BaseProvider.prototype.removeBackground) {
    capabilities.push("remove_background");
  }
  if (instance.relightImage !== BaseProvider.prototype.relightImage) {
    capabilities.push("relight_image");
  }
  if (instance.vectorizeImage !== BaseProvider.prototype.vectorizeImage) {
    capabilities.push("vectorize_image");
  }
  if (instance.videoToVideo !== BaseProvider.prototype.videoToVideo) {
    capabilities.push("video_to_video");
  }
  if (instance.lipSync !== BaseProvider.prototype.lipSync) {
    capabilities.push("lip_sync");
  }
  if (
    instance.getAvailableTTSModels !==
    BaseProvider.prototype.getAvailableTTSModels
  ) {
    capabilities.push("text_to_speech");
  }
  if (
    instance.getAvailableMusicModels !==
    BaseProvider.prototype.getAvailableMusicModels
  ) {
    capabilities.push("text_to_music");
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

  /**
   * Record the exact payload this provider is about to send to the upstream
   * API. Call this right before the network request in `generateMessage` /
   * `generateMessages`. On failure, the traced wrappers log precisely what was
   * sent (secrets redacted, large fields truncated). Safe to call even outside
   * a traced call — it is a no-op when no capture slot is active.
   */
  protected recordRequestPayload(payload: unknown): void {
    setLastRequest(payload);
  }

  protected constructor(provider: ProviderId) {
    this.provider = provider;
    this.installModalityFailureLogging();
  }

  /**
   * Chat already records what it sent and logs it on failure through
   * {@link generateMessageTraced} / {@link generateMessagesTraced}. The
   * non-chat modalities (image/video/audio/3D/embedding) are called directly,
   * so wrap every one a concrete provider actually overrides with the same
   * central failure logging.
   *
   * We replace methods on the instance (not the prototype), and only the ones
   * that differ from the base — so an unsupported modality keeps its base
   * "does not support" throw and never logs a spurious failure. Providers may
   * additionally call {@link recordRequestPayload} to log the exact wire body;
   * otherwise the call arguments are logged (binary buffers reduced to size
   * markers, secrets redacted).
   */
  private installModalityFailureLogging(): void {
    const proto = BaseProvider.prototype as unknown as Record<string, unknown>;
    const self = this as unknown as Record<string, unknown>;

    for (const name of MODALITY_PROMISE_METHODS) {
      const fn = self[name];
      if (typeof fn !== "function" || fn === proto[name]) continue;
      const original = fn as (...args: unknown[]) => Promise<unknown>;
      self[name] = (...args: unknown[]): Promise<unknown> =>
        withModalityCapture(async (alreadyActive) => {
          try {
            return await original.apply(this, args);
          } catch (err) {
            if (!alreadyActive) {
              logProviderRequestFailure({
                provider: this.provider,
                model: extractModelId(args),
                request: peekLastRequest(),
                nodetoolArgs: args,
                error: err
              });
            }
            throw err;
          }
        });
    }

    for (const name of MODALITY_GENERATOR_METHODS) {
      const fn = self[name];
      if (typeof fn !== "function" || fn === proto[name]) continue;
      const original = fn as (...args: unknown[]) => AsyncGenerator<unknown>;
      self[name] = (...args: unknown[]): AsyncGenerator<unknown> =>
        wrapModalityGenerator(this, original, args);
    }
  }

  static requiredSecrets(): string[] {
    return [];
  }

  /**
   * Explicit capability declaration. Returns `null` by default, in which case
   * {@link getCapabilities} derives capabilities by reflecting on which
   * optional methods the concrete class overrides. Providers may override this
   * to declare their capabilities directly — a robust alternative to method
   * reflection when methods are wrapped, bound, or composed via mixins.
   */
  protected declaredCapabilities(): ProviderCapability[] | null {
    return null;
  }

  /**
   * The capabilities this provider exposes. Prefers an explicit declaration
   * from {@link declaredCapabilities}; otherwise falls back to reflecting over
   * overridden methods via {@link providerCapabilities}. Callers should use
   * this instead of calling `providerCapabilities()` directly so explicit
   * declarations are honored.
   */
  getCapabilities(): ProviderCapability[] {
    const declared = this.declaredCapabilities();
    if (declared) {
      // Message generation is always available; ensure it is present.
      const set = new Set<ProviderCapability>(declared);
      set.add("generate_message");
      set.add("generate_messages");
      return [...set];
    }
    return providerCapabilities(this);
  }

  getContainerEnv(): Record<string, string> {
    return {};
  }

  /**
   * Release any resources held by this provider (HTTP connection pools, cached
   * model metadata, child processes, etc.). Default is a no-op; providers that
   * hold long-lived resources should override it. Safe to call more than once.
   * Callers that own a provider instance should invoke this on shutdown.
   */
  async close(): Promise<void> {}

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

  /**
   * Music **generation** models exposed by this provider (e.g. MusicGen,
   * Stable Audio, Suno, MiniMax Music). Override on providers that can
   * synthesize music from a text prompt; the base returns none so the
   * `text_to_music` capability is advertised only when overridden.
   */
  async getAvailableMusicModels(): Promise<MusicModel[]> {
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
    /**
     * Opaque continuation token from a prior turn (read off the last assistant
     * message). Providers that support server/SDK-side sessions resume from it
     * and send only the delta; stateless providers ignore it.
     */
    providerSession?: ProviderSession | null;
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
     * multi-turn tool execution within a single call.
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
    /**
     * Opaque continuation token from a prior turn (read off the last assistant
     * message). Providers that support server/SDK-side sessions resume from it
     * and send only the delta; stateless providers ignore it.
     */
    providerSession?: ProviderSession | null;
    /**
     * Lazily fetch the full conversation. When a session-based provider is
     * handed only the new delta in `messages` (to avoid reloading the whole
     * thread), it calls this to recover the complete history if it must prime
     * context — i.e. when a resume fails or the system prompt changed. Absent
     * when `messages` already holds the full history.
     */
    loadFullHistory?: () => Promise<Message[]>;
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
    let requestPayload: unknown = null;
    try {
      // withUsageCapture creates a per-call AsyncLocalStorage slot so
      // trackUsage() in the provider hands its numbers back to us.
      result = await withUsageCapture(async () => {
        try {
          const r = await doCall();
          usage = consumeLastUsage();
          return r;
        } finally {
          // Read the recorded wire payload while still inside the capture slot.
          requestPayload = peekLastRequest();
        }
      });
      return result;
    } catch (err) {
      error = String(err);
      logProviderRequestFailure({
        provider: this.provider,
        model: args.model,
        request: requestPayload,
        nodetoolArgs: { model: args.model, messages: args.messages, tools: args.tools },
        error: err
      });
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
    const { runInSlot, getUsage, getRequest } = createUsageSlot();
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
      logProviderRequestFailure({
        provider: this.provider,
        model: args.model,
        request: getRequest(),
        nodetoolArgs: {
          model: args.model,
          messages: args.messages,
          tools: (args as Record<string, unknown>).tools
        },
        error: err
      });
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

  /**
   * Run the agentic tool-calling loop and stream its events. This is the entry
   * point an agent harness calls; the harness no longer implements the loop
   * itself. The default implementation drives the standard external loop:
   * stream one {@link generateMessages} turn, collect any tool calls, run them
   * via the harness-supplied {@link executeTool}, append the results, and repeat
   * until the model stops calling tools (or `maxIterations` is hit).
   *
   * It yields the same {@link Chunk}/{@link ToolCall}/{@link ProviderSessionUpdate}
   * items a single turn does — for live display — plus a
   * {@link ProviderMessageEvent} for every finalized message (assistant turns
   * and tool results) so the harness can persist/collect them without
   * reassembling them from chunks.
   *
   * Providers whose backend runs its own agent loop (e.g. the Claude Agent SDK)
   * override this to drive that loop instead, while still emitting the same
   * stream items. `generateMessages` remains the single-turn primitive.
   */
  async *generateLoop(
    args: Parameters<this["generateMessages"]>[0] & {
      /**
       * Execute one tool call and return the result to feed back to the model
       * (and to store in the tool message). Usually result text; a tool may
       * instead return {@link MessageContent} blocks (e.g. an image) for
       * vision-capable providers. The harness owns tool resolution, gating, and
       * side effects; the provider only orchestrates.
       */
      executeTool?: (toolCall: ToolCall) => Promise<string | MessageContent[]>;
      /** Cap on tool-calling rounds before stopping. Defaults to 25. */
      maxIterations?: number;
    }
  ): AsyncGenerator<ProviderStreamItem> {
    const maxIterations = args.maxIterations ?? 25;
    const { executeTool, maxIterations: _omitMax, ...turnArgs } = args;
    const messages = [...args.messages];

    // Bridge to the legacy inline tool callback for any provider that executes
    // tools mid-stream instead of yielding ToolCall items. Real providers yield
    // ToolCall (handled below); this keeps the inline path working too. That
    // channel is string-only, so image results collapse to their text.
    let toolCallSeq = 0;
    const onToolCall = executeTool
      ? async (name: string, toolArgs: Record<string, unknown>) => {
          const result = await executeTool({
            id: `call_${++toolCallSeq}`,
            name,
            args: toolArgs
          });
          return typeof result === "string" ? result : toolResultToText(result);
        }
      : turnArgs.onToolCall;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (turnArgs.signal?.aborted) return;
      let assistantText = "";
      const pending: ToolCall[] = [];

      for await (const item of this.generateMessagesTraced({
        ...turnArgs,
        messages,
        onToolCall
      })) {
        if (turnArgs.signal?.aborted) break;
        if (isProviderSessionUpdate(item) || isProviderMessageEvent(item)) {
          yield item;
          continue;
        }
        if ("id" in item && "name" in item && "args" in item) {
          pending.push(item);
          yield item;
          continue;
        }
        const chunk = item as { content?: unknown; thinking?: boolean };
        if (typeof chunk.content === "string" && !chunk.thinking) {
          assistantText += chunk.content;
        }
        yield item;
      }

      if (pending.length === 0) {
        const assistantMsg: Message = {
          role: "assistant",
          content: assistantText || null
        };
        messages.push(assistantMsg);
        yield { type: "message", message: assistantMsg };
        return;
      }

      // The assistant turn requested tools — emit it (with the calls), run them,
      // then loop with the results appended.
      const assistantMsg: Message = {
        role: "assistant",
        content: assistantText || null,
        toolCalls: pending
      };
      messages.push(assistantMsg);
      yield { type: "message", message: assistantMsg };

      const results = await Promise.all(
        pending.map(async (tc) => ({
          tc,
          content: executeTool
            ? await executeTool(tc)
            : `Tool "${tc.name}" is not available`
        }))
      );
      for (const { tc, content } of results) {
        const { toolContent, imageMessage } = splitToolResultImages(content);
        const toolMsg: Message = {
          role: "tool",
          toolCallId: tc.id,
          content: toolContent
        };
        messages.push(toolMsg);
        yield { type: "message", message: toolMsg };
        if (imageMessage) {
          // The pixels ride a user message for the next model turn (most
          // providers can't render an image in a tool-result message). It is
          // in-flight only — pushed to the loop's messages but never yielded,
          // so it is never persisted or echoed, keeping saved history cheap.
          messages.push(imageMessage);
        }
      }
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

  /**
   * Transform one or more source images into a single output image.
   *
   * The first image is the primary subject; providers that accept multiple
   * reference images (e.g. multi-image editing / composition) use the rest,
   * while single-image providers operate on `images[0]`.
   */
  async imageToImage(
    _images: Uint8Array[],
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
    images: Uint8Array[],
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (let i = 0; i < numImages; i++) {
      results.push(await this.imageToImage(images, params));
    }
    return results;
  }

  /**
   * Inpaint: regenerate the masked region of one or more source images
   * according to a prompt. Like {@link imageToImage} but mask-guided — the mask
   * is routed to whatever mask input the target endpoint declares.
   *
   * The first image is the primary subject; the mask in `params.mask` marks the
   * region to regenerate (white = regenerate).
   */
  async inpaint(
    _images: Uint8Array[],
    _params: InpaintingParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support inpaint`);
  }

  /**
   * Generate multiple inpaint results in one logical call.
   *
   * Default implementation calls inpaint() sequentially as a fallback.
   * Providers that support native batch generation should override this.
   */
  async inpaintImages(
    images: Uint8Array[],
    params: InpaintingParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (let i = 0; i < numImages; i++) {
      results.push(await this.inpaint(images, params));
    }
    return results;
  }

  /** Increase the resolution / detail of an image. */
  async upscaleImage(
    _image: Uint8Array,
    _params: UpscaleImageParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support upscaleImage`);
  }

  /** Remove the background from an image, returning an image with alpha. */
  async removeBackground(
    _image: Uint8Array,
    _params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support removeBackground`);
  }

  /** Re-light a subject according to a prompt / background reference. */
  async relightImage(
    _image: Uint8Array,
    _params: RelightImageParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support relightImage`);
  }

  /** Convert a raster image into a vector (SVG) representation. */
  async vectorizeImage(
    _image: Uint8Array,
    _params: VectorizeImageParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support vectorizeImage`);
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

  /**
   * True when this provider streams raw PCM via {@link textToSpeech}. Providers
   * that only return encoded audio files (e.g. FAL/KIE) leave the base method in
   * place and are consumed via {@link textToSpeechEncoded} instead.
   */
  supportsStreamingTextToSpeech(): boolean {
    return this.textToSpeech !== BaseProvider.prototype.textToSpeech;
  }

  /**
   * Generate music / instrumental audio from a text prompt. Music providers
   * return a fully-encoded audio file (mp3/wav/flac), so this resolves to an
   * {@link EncodedAudioResult} rather than streaming raw PCM. Providers that
   * expose music models via {@link getAvailableMusicModels} must override this.
   */
  async textToMusic(_params: TextToMusicParams): Promise<EncodedAudioResult> {
    throw new Error(`${this.provider} does not support textToMusic`);
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

  /**
   * Animate one or more source images into a video. Single-frame providers
   * use `images[0]`; providers with multi-reference support may use more.
   */
  async imageToVideo(
    _images: Uint8Array[],
    _params: ImageToVideoParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support imageToVideo`);
  }

  /** Restyle / edit an existing video, guided by a prompt. */
  async videoToVideo(
    _video: Uint8Array,
    _params: VideoToVideoParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support videoToVideo`);
  }

  /** Drive a face in a video/image to match the speech in an audio track. */
  async lipSync(
    _video: Uint8Array,
    _params: LipSyncParams
  ): Promise<Uint8Array> {
    throw new Error(`${this.provider} does not support lipSync`);
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
    const { importNodeBuiltin } = await import("@nodetool-ai/config");
    const fsP = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    if (!fsP) {
      throw new Error(
        "resolveUri requires node:fs/promises (Node-only feature)"
      );
    }

    if (uri.startsWith("file://")) {
      try {
        const urlMod = await importNodeBuiltin<typeof import("node:url")>(
          "node:url"
        );
        if (!urlMod) {
          throw new Error("resolveUri file:// requires node:url");
        }
        const filePath = urlMod.fileURLToPath(uri);
        const bytes = (await fsP.readFile(filePath)) as Uint8Array;
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
        return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
      } catch {
        return uri;
      }
    }

    // Legacy: old messages stored with browser-facing /api/storage/ path
    if (uri.startsWith("/api/storage/")) {
      const key = uri.slice("/api/storage/".length);
      try {
        const bytes = (await fsP.readFile(getAssetFilePath(key))) as Uint8Array;
        const ext = key.split(".").pop()?.toLowerCase() ?? "";
        const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
        return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
      } catch {
        // Remote deployment: file not local, fall back to absolute HTTP
        return `http://127.0.0.1:${process.env.PORT ?? 7777}${uri}`;
      }
    }

    return uri;
  }
}

/**
 * Promise-returning non-chat modality methods wrapped with central failure
 * logging. Batch helpers are included; nested delegation to their singular
 * method is logged once (see {@link withModalityCapture}).
 */
const MODALITY_PROMISE_METHODS = [
  "textToImage",
  "textToImages",
  "imageToImage",
  "imageToImages",
  "inpaint",
  "inpaintImages",
  "upscaleImage",
  "removeBackground",
  "relightImage",
  "vectorizeImage",
  "textToSpeechEncoded",
  "textToMusic",
  "automaticSpeechRecognition",
  "textToVideo",
  "imageToVideo",
  "videoToVideo",
  "lipSync",
  "textTo3D",
  "imageTo3D",
  "generateEmbedding"
] as const;

/** Async-generator non-chat modality methods wrapped with failure logging. */
const MODALITY_GENERATOR_METHODS = ["textToSpeech"] as const;

/**
 * Best-effort model id for failure logging. Modality params carry the model
 * either as a plain string (ASR, embeddings) or as a model object with an `id`
 * (image/video tasks). Returns "unknown" when neither is present.
 */
function extractModelId(args: unknown[]): string {
  for (const arg of args) {
    if (!arg || typeof arg !== "object") continue;
    const model = (arg as { model?: unknown }).model;
    if (typeof model === "string") return model;
    if (model && typeof model === "object") {
      const id = (model as { id?: unknown }).id;
      if (typeof id === "string") return id;
    }
  }
  return "unknown";
}

/**
 * Drive a provider's async-generator modality method (e.g. textToSpeech)
 * through a per-call slot — so `recordRequestPayload` is visible across yields —
 * and log centrally if it throws. The slot is wrapped around each `next()`
 * because AsyncLocalStorage does not persist across generator suspension.
 */
async function* wrapModalityGenerator(
  provider: BaseProvider,
  original: (...args: unknown[]) => AsyncGenerator<unknown>,
  args: unknown[]
): AsyncGenerator<unknown> {
  const { runInSlot, getRequest } = createUsageSlot();
  const source = original.apply(provider, args);
  let exhausted = false;
  try {
    while (true) {
      const result = await runInSlot(() => source.next());
      if (result.done) {
        exhausted = true;
        return result.value;
      }
      yield result.value;
    }
  } catch (err) {
    logProviderRequestFailure({
      provider: provider.provider,
      model: extractModelId(args),
      request: getRequest(),
      nodetoolArgs: args,
      error: err
    });
    throw err;
  } finally {
    if (!exhausted) {
      await runInSlot(
        () =>
          source.return?.(undefined as never) ??
          Promise.resolve({
            done: true,
            value: undefined
          } as IteratorResult<unknown>)
      ).catch(() => {});
    }
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
    ...(usage.cost !== undefined && { "gen_ai.usage.cost_usd": usage.cost })
  });
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf"
};
