/**
 * Comfy Provider — every model behind one `COMFY_API_KEY`.
 *
 * Generation runs through the Comfy Router (https://api.comfy.org/v2/models),
 * which fronts the partner models Comfy resells: image, video, speech and
 * chat. Calls use the Router's queue, and each request body is built from the
 * model's published input schema (see `comfy-router.ts`).
 *
 * The model list is the catalog snapshot in `comfy-router-catalog.ts`,
 * intersected with the live listing when it can be read.
 *
 * Running an arbitrary ComfyUI graph on Comfy Cloud stays with the `lib.comfy`
 * nodes; the same key authenticates partner API nodes inside those graphs.
 *
 * Billing: the Router reports credits per run in `X-Comfy-Credits-Used`; this
 * provider does not convert them into a dollar cost record.
 *
 * API keys: https://platform.comfy.org
 */

import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  ComfyRouterClient,
  RouterArgsBuilder,
  sniffMime,
  type MediaInput
} from "./comfy-router.js";
import {
  COMFY_ROUTER_CATALOG,
  routerModelName,
  type RouterCatalogEntry
} from "./comfy-router-catalog.js";
import type {
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToImageParams,
  TextToSpeechParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel,
  VideoToVideoParams
} from "./types.js";

const PROMPT_FIELDS = ["prompt", "text_prompt", "prompt_text", "promptText", "text", "instruction", "description"] as const;
const NEGATIVE_FIELDS = ["negative_prompt", "negativePrompt", "negative_text"] as const;
const IMAGE_FIELDS = [
  "image_url", "image", "input_image", "image_urls", "images", "input_images", "init_image",
  "imageUrl", "image_base64", "input_image_url", "first_frame_image", "first_frame",
  "start_image", "start_image_url", "first_frame_url", "image_input", "reference_image",
  "reference_images", "promptImage", "prompt_image", "source_image"
] as const;
const END_IMAGE_FIELDS = ["end_image_url", "end_image", "last_frame_image", "last_frame", "tail_image_url", "image_tail", "last_frame_url"] as const;
const REFERENCE_FIELDS = ["reference_images", "reference_image_urls", "image_urls", "images", "references", "subject_images", "reference_image"] as const;
const VIDEO_FIELDS = ["video_url", "video", "input_video", "video_urls", "source_video", "videoUri", "video_base64"] as const;
const AUDIO_FIELDS = ["audio_url", "audio", "input_audio", "audio_urls"] as const;
const DURATION_FIELDS = ["duration", "duration_seconds", "durationSeconds", "seconds", "video_length", "length"] as const;
const ASPECT_FIELDS = ["aspect_ratio", "aspectRatio", "ratio"] as const;
const RESOLUTION_FIELDS = ["resolution", "quality_resolution", "output_resolution"] as const;
const SEED_FIELDS = ["seed", "random_seed"] as const;
const STEPS_FIELDS = ["num_inference_steps", "steps"] as const;
const GUIDANCE_FIELDS = ["guidance_scale", "guidance", "cfg_scale", "cfg"] as const;
const FRAMES_FIELDS = ["num_frames", "frames", "frame_count"] as const;
const QUALITY_FIELDS = ["quality"] as const;
const STRENGTH_FIELDS = ["strength", "image_strength", "prompt_strength"] as const;
const SPEECH_TEXT_FIELDS = ["text", "input", "prompt"] as const;
const VOICE_FIELDS = ["voice_id", "voice", "speaker", "voice_type"] as const;

const IMAGE_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "3:2": "1216x832",
  "2:3": "832x1216"
};

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export class ComfyCloudProvider extends BaseProvider {
  private readonly apiKey: string;
  private router: ComfyRouterClient | null = null;
  private liveIds: Promise<Set<string> | null> | null = null;

  static override requiredSecrets(): string[] {
    return ["COMFY_API_KEY"];
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "reference_to_video",
      "video_to_video",
      "text_to_speech"
    ];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.COMFY_CLOUD);
    this.apiKey = (secrets["COMFY_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { COMFY_API_KEY: this.apiKey };
  }

  /** Split out so tests can inject a client with a fake `fetch`. */
  protected createRouter(): ComfyRouterClient {
    const apiKey = this.apiKey.trim();
    if (!apiKey) {
      throw new Error(
        "COMFY_API_KEY is required for Comfy models. Add it in Settings; get a key at https://platform.comfy.org."
      );
    }
    return new ComfyRouterClient({ apiKey });
  }

  protected getRouter(): ComfyRouterClient {
    this.router ??= this.createRouter();
    return this.router;
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  /** The live listing, or null when it cannot be read (offline, no key). */
  private liveModelIds(): Promise<Set<string> | null> {
    this.liveIds ??= (async () => {
      if (!this.apiKey.trim()) return null;
      try {
        return new Set(await this.getRouter().listModels(AbortSignal.timeout(10_000)));
      } catch {
        return null;
      }
    })();
    return this.liveIds;
  }

  private async entries(kind: RouterCatalogEntry["kind"]): Promise<RouterCatalogEntry[]> {
    const live = await this.liveModelIds();
    return COMFY_ROUTER_CATALOG.filter(
      (entry) => entry.kind === kind && (live === null || live.has(entry.id))
    );
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return (await this.entries("image")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD,
      supportedTasks: [...entry.tasks]
    }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return (await this.entries("video")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD,
      supportedTasks: [...entry.tasks]
    }));
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return (await this.entries("speech")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD
    }));
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return (await this.entries("text")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD
    }));
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // ── Request building ───────────────────────────────────────────────────────

  private async builder(modelId: string, signal?: AbortSignal): Promise<RouterArgsBuilder> {
    return new RouterArgsBuilder(await this.getRouter().inputSchema(modelId, signal));
  }

  private finish(b: RouterArgsBuilder, modelId: string): Record<string, unknown> {
    b.fillRequiredDefaults();
    const missing = b.missingRequired();
    if (missing.length > 0) {
      throw new Error(
        `Comfy model ${modelId} needs ${missing.join(", ")}, which this request does not provide.`
      );
    }
    return b.body;
  }

  private image(bytes: Uint8Array): MediaInput {
    return { bytes, mimeType: sniffMime(bytes, "image/png") };
  }

  private setCommon(
    b: RouterArgsBuilder,
    params: {
      prompt?: string | null;
      negativePrompt?: string | null;
      aspectRatio?: string | null;
      resolution?: string | null;
      seed?: number | null;
      numInferenceSteps?: number | null;
      guidanceScale?: number | null;
    }
  ): void {
    if (params.prompt) b.setFirst(PROMPT_FIELDS, params.prompt);
    b.setFirst(NEGATIVE_FIELDS, params.negativePrompt);
    b.setFirst(ASPECT_FIELDS, params.aspectRatio);
    b.setFirst(RESOLUTION_FIELDS, params.resolution);
    if (typeof params.seed === "number" && params.seed >= 0) b.setFirst(SEED_FIELDS, params.seed);
    b.setFirst(STEPS_FIELDS, params.numInferenceSteps);
    b.setFirst(GUIDANCE_FIELDS, params.guidanceScale);
  }

  private setImageSize(b: RouterArgsBuilder, width?: number | null, height?: number | null, aspect?: string | null): void {
    if (width && height) {
      if (b.declares("width") && b.declares("height")) {
        b.set("width", width).set("height", height);
        return;
      }
      b.setFirst(["size", "image_size"], `${width}x${height}`);
      return;
    }
    if (aspect && !b.firstDeclared(ASPECT_FIELDS) && IMAGE_SIZES[aspect]) {
      b.setFirst(["size", "image_size"], IMAGE_SIZES[aspect]);
    }
  }

  private setVideoTiming(b: RouterArgsBuilder, durationSeconds?: number | null, numFrames?: number | null): void {
    if (durationSeconds && durationSeconds > 0) {
      const name = b.firstDeclared(DURATION_FIELDS);
      if (name) {
        b.set(name, durationSeconds);
        // Enum durations are often strings such as "5s".
        if (!(name in b.body)) b.set(name, `${durationSeconds}s`);
      }
    }
    if (numFrames && numFrames > 0) b.setFirst(FRAMES_FIELDS, numFrames);
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, params);
    this.setImageSize(b, params.width, params.height, params.aspectRatio);
    b.setFirst(QUALITY_FIELDS, params.quality);
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "image", {
      signal: params.signal
    });
    return result.bytes;
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    if (images.length === 0) throw new Error("imageToImage needs at least one image");
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, params);
    this.setImageSize(b, params.targetWidth, params.targetHeight, params.aspectRatio);
    b.setFirst(QUALITY_FIELDS, params.quality);
    b.setFirst(STRENGTH_FIELDS, params.strength);
    const attached = b.attachMedia(IMAGE_FIELDS, images.map((img) => this.image(img)));
    if (!attached) throw new Error(`Comfy model ${modelId} takes no input image`);
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "image", {
      signal: params.signal
    });
    return result.bytes;
  }

  // ── Video ──────────────────────────────────────────────────────────────────

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, params);
    this.setVideoTiming(b, params.durationSeconds, params.numFrames);
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, params);
    this.setVideoTiming(b, params.durationSeconds, params.numFrames);
    const attached = b.attachMedia(IMAGE_FIELDS, [this.image(image)]);
    if (!attached) throw new Error(`Comfy model ${modelId} takes no start image`);
    if (params.endImage) b.attachMedia(END_IMAGE_FIELDS, [this.image(params.endImage)]);
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, params);
    this.setVideoTiming(b, params.durationSeconds, params.numFrames);
    if (inputs.images.length > 0) b.attachMedia(REFERENCE_FIELDS, inputs.images.map((img) => this.image(img)));
    if (inputs.videos.length > 0) {
      b.attachMedia(VIDEO_FIELDS, inputs.videos.map((bytes) => ({ bytes, mimeType: sniffMime(bytes, "video/mp4") })));
    }
    if (inputs.audios?.length) {
      b.attachMedia(AUDIO_FIELDS, inputs.audios.map((bytes) => ({ bytes, mimeType: "audio/mpeg" })));
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async videoToVideo(video: Uint8Array, params: VideoToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, { ...params, prompt: params.prompt ?? undefined });
    const attached = b.attachMedia(VIDEO_FIELDS, [{ bytes: video, mimeType: sniffMime(video, "video/mp4") }]);
    if (!attached) throw new Error(`Comfy model ${modelId} takes no input video`);
    if (params.referenceImages?.length) {
      b.attachMedia(REFERENCE_FIELDS, params.referenceImages.map((img) => this.image(img)));
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal
    });
    return result.bytes;
  }

  // ── Speech ─────────────────────────────────────────────────────────────────

  override async textToSpeechEncoded(args: TextToSpeechParams): Promise<EncodedAudioResult | null> {
    const modelId = args.model;
    const b = await this.builder(modelId, args.signal);
    b.setFirst(SPEECH_TEXT_FIELDS, args.text);
    b.setFirst(VOICE_FIELDS, args.voice);
    b.setFirst(["speed"], args.speed);
    b.setFirst(["language_code", "language"], args.language);
    b.setFirst(["instructions", "style"], args.instructions);
    if (args.referenceAudio) {
      b.attachMedia(["reference_audio", "audio_prompt", ...AUDIO_FIELDS], [
        { bytes: args.referenceAudio, mimeType: "audio/wav" }
      ]);
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "audio", {
      signal: args.signal
    });
    return { data: result.bytes, mimeType: result.mimeType };
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  /**
   * Native request shapes differ by provider: Anthropic Messages for
   * `anthropic/*`, Gemini `contents` when the schema declares it, and OpenAI
   * chat completions otherwise.
   */
  private async chatRequest(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    signal?: AbortSignal;
  }): Promise<{ shape: "anthropic" | "gemini" | "openai"; body: Record<string, unknown> }> {
    const schema = await this.getRouter().inputSchema(args.model, args.signal);
    const declares = (name: string): boolean => schema.open || schema.fields.has(name);
    const system = args.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
    const turns = args.messages.filter((m) => m.role !== "system");

    if (schema.fields.has("contents")) {
      const body: Record<string, unknown> = {
        contents: turns.map((m) => {
          if (m.role === "tool") {
            return {
              role: "user",
              parts: [{ functionResponse: { name: m.toolCallId ?? "tool", response: { content: textOf(m.content) } } }]
            };
          }
          const parts: unknown[] = [];
          const text = textOf(m.content);
          if (text) parts.push({ text });
          for (const call of m.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.args } });
          return { role: m.role === "assistant" ? "model" : "user", parts };
        })
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (args.tools?.length) {
        body.tools = [{ functionDeclarations: args.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }];
      }
      const generationConfig: Record<string, unknown> = {};
      if (args.maxTokens) generationConfig.maxOutputTokens = args.maxTokens;
      if (args.temperature !== undefined) generationConfig.temperature = args.temperature;
      if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
      return { shape: "gemini", body };
    }

    if (args.model.startsWith("anthropic/")) {
      const body: Record<string, unknown> = {
        max_tokens: args.maxTokens ?? 4096,
        messages: turns.map((m) => {
          if (m.role === "tool") {
            return {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: textOf(m.content), is_error: m.isError ?? false }]
            };
          }
          const blocks: unknown[] = [];
          const text = textOf(m.content);
          if (text) blocks.push({ type: "text", text });
          for (const call of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
          return { role: m.role, content: blocks };
        })
      };
      if (declares("model")) body.model = args.model.slice("anthropic/".length);
      if (system) body.system = system;
      if (args.temperature !== undefined) body.temperature = args.temperature;
      if (args.tools?.length) {
        body.tools = args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema ?? { type: "object" } }));
      }
      return { shape: "anthropic", body };
    }

    const messages: unknown[] = [];
    if (system) messages.push({ role: "system", content: system });
    for (const m of turns) {
      if (m.role === "tool") {
        messages.push({ role: "tool", tool_call_id: m.toolCallId ?? "", content: textOf(m.content) });
        continue;
      }
      const msg: Record<string, unknown> = { role: m.role, content: textOf(m.content) };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }));
      }
      messages.push(msg);
    }
    const body: Record<string, unknown> = { messages };
    if (declares("model")) body.model = args.model.slice(args.model.indexOf("/") + 1);
    if (args.maxTokens) body[declares("max_completion_tokens") ? "max_completion_tokens" : "max_tokens"] = args.maxTokens;
    if (args.temperature !== undefined) body.temperature = args.temperature;
    if (args.topP !== undefined) body.top_p = args.topP;
    if (args.tools?.length) {
      body.tools = args.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema ?? { type: "object" } }
      }));
    }
    return { shape: "openai", body };
  }

  /** Token counts from whichever native usage block the result carries. */
  private recordUsage(model: string, result: unknown): void {
    if (!isRecord(result)) return;
    const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const usage = isRecord(result.usage) ? result.usage : isRecord(result.usageMetadata) ? result.usageMetadata : null;
    if (!usage) return;
    const cached = num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
    const inputTokens =
      num(usage.input_tokens) + cached || num(usage.prompt_tokens) || num(usage.promptTokenCount);
    const outputTokens = num(usage.output_tokens) || num(usage.completion_tokens) || num(usage.candidatesTokenCount);
    this.trackUsage(model, { inputTokens, outputTokens, cachedTokens: num(usage.cache_read_input_tokens) });
  }

  private parseChat(shape: "anthropic" | "gemini" | "openai", result: unknown): Message {
    const toolCalls: ToolCall[] = [];
    let text = "";
    if (shape === "anthropic" && isRecord(result) && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") text += block.text;
        if (block.type === "tool_use") {
          toolCalls.push({ id: String(block.id), name: String(block.name), args: parseArgs(block.input) });
        }
      }
    } else if (shape === "gemini" && isRecord(result) && Array.isArray(result.candidates)) {
      const first = result.candidates[0];
      const parts = isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts) ? first.content.parts : [];
      parts.forEach((part, i) => {
        if (!isRecord(part)) return;
        if (typeof part.text === "string" && part.thought !== true) text += part.text;
        if (isRecord(part.functionCall)) {
          toolCalls.push({ id: `call_${i}`, name: String(part.functionCall.name), args: parseArgs(part.functionCall.args) });
        }
      });
    } else if (isRecord(result) && Array.isArray(result.choices)) {
      const first = result.choices[0];
      const message = isRecord(first) && isRecord(first.message) ? first.message : {};
      if (typeof message.content === "string") text = message.content;
      if (Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          if (!isRecord(call) || !isRecord(call.function)) continue;
          toolCalls.push({ id: String(call.id), name: String(call.function.name), args: parseArgs(call.function.arguments) });
        }
      }
    } else {
      throw new Error(`Comfy chat model returned an unrecognized result: ${JSON.stringify(result).slice(0, 300)}`);
    }
    return { role: "assistant", content: text, toolCalls: toolCalls.length > 0 ? toolCalls : null };
  }

  async generateMessage(args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    const { shape, body } = await this.chatRequest(args);
    const result = await this.getRouter().runJson(args.model, body, { signal: args.signal });
    this.recordUsage(args.model, result);
    return this.parseChat(shape, result);
  }

  /** The Router returns whole results, so this yields the reply in one chunk. */
  async *generateMessages(args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    const message = await this.generateMessage(args);
    for (const call of message.toolCalls ?? []) yield call;
    yield { type: "chunk", content: typeof message.content === "string" ? message.content : "", done: true };
  }
}
