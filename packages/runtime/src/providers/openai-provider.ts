import OpenAI, { toFile } from "openai";
// `sharp` is loaded lazily at the call site. Importing it at module scope
// pulls its native binding into anything that re-exports this provider —
// notably the Electron main bundle, where Vite/Rollup can't resolve sharp's
// dynamic require for `@img/sharp-*.node` and the app crashes at launch.
import type { Chunk } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";

const log = createLogger("nodetool.runtime.providers.openai");
import type {
  ASRModel,
  EmbeddingModel,
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageAudioContent,
  MessageContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  StreamingAudioChunk,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel
} from "./types.js";

interface OpenAIProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

interface MutableToolCall {
  id: string;
  name: string;
  arguments: string;
}

function asUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (Array.isArray(data) && data.every((v) => Number.isInteger(v))) {
    return new Uint8Array(data as number[]);
  }
  if (typeof data === "string") {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  throw new Error("Unsupported binary payload format");
}

function toInt16Samples(bytes: Uint8Array): Int16Array {
  const aligned =
    bytes.length % 2 === 0 ? bytes : bytes.slice(0, bytes.length - 1);
  return new Int16Array(
    aligned.buffer,
    aligned.byteOffset,
    aligned.byteLength / 2
  );
}

function parseDataUri(uri: string): { mime: string; data: Uint8Array } {
  const idx = uri.indexOf(",");
  if (idx < 0) {
    throw new Error("Invalid data URI");
  }

  const header = uri.slice(5, idx);
  const payload = uri.slice(idx + 1);
  const isBase64 = header.includes(";base64");
  const mime = header.split(";")[0] || "application/octet-stream";

  if (isBase64) {
    return { mime, data: Uint8Array.from(Buffer.from(payload, "base64")) };
  }

  return {
    mime,
    data: Uint8Array.from(Buffer.from(decodeURIComponent(payload), "utf8"))
  };
}

function makeDataUri(mime: string, data: Uint8Array): string {
  const b64 = Buffer.from(data).toString("base64");
  return `data:${mime};base64,${b64}`;
}

/**
 * Custom JSON replacer that handles objects with toJSON() methods
 * and other non-serializable types. Mirrors Python's _default_serializer.
 */
function defaultSerializer(_key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  if (
    typeof value === "object" &&
    "toJSON" in value &&
    typeof (value as { toJSON: unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}

export class OpenAIProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["OPENAI_API_KEY"];
  }

  readonly apiKey: string;
  private _client: OpenAI | null;
  private _clientFactory: (apiKey: string) => OpenAI;
  private _fetch: typeof fetch;

  constructor(
    secrets: { OPENAI_API_KEY?: string },
    options: OpenAIProviderOptions = {}
  ) {
    super("openai");

    const apiKey = secrets.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }

    this.apiKey = apiKey;
    this._client = options.client ?? null;
    this._clientFactory =
      options.clientFactory ?? ((key) => new OpenAI({ apiKey: key }));
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv(): Record<string, string> {
    return { OPENAI_API_KEY: this.apiKey };
  }

  getClient(): OpenAI {
    if (!this._client) {
      this._client = this._clientFactory(this.apiKey);
    }
    return this._client;
  }

  async hasToolSupport(model: string): Promise<boolean> {
    return !(model.startsWith("o1") || model.startsWith("o3"));
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.id,
        provider: "openai"
      }));
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [
      {
        id: "tts-1",
        name: "TTS 1",
        provider: "openai",
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
      },
      {
        id: "tts-1-hd",
        name: "TTS 1 HD",
        provider: "openai",
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
      }
    ];
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      {
        id: "whisper-1",
        name: "Whisper",
        provider: "openai"
      }
    ];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "sora-2",
        name: "Sora 2",
        provider: "openai",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "sora-2-pro",
        name: "Sora 2 Pro",
        provider: "openai",
        supportedTasks: ["text_to_video"]
      }
    ];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "gpt-image-2",
        name: "GPT Image 2",
        provider: "openai",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "gpt-image-1.5",
        name: "GPT Image 1.5",
        provider: "openai",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        provider: "openai",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "gpt-image-1-mini",
        name: "GPT Image 1 Mini",
        provider: "openai",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ];
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [
      {
        id: "text-embedding-3-small",
        name: "Text Embedding 3 Small",
        provider: "openai",
        dimensions: 1536
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large",
        provider: "openai",
        dimensions: 3072
      },
      {
        id: "text-embedding-ada-002",
        name: "Text Embedding Ada 002",
        provider: "openai",
        dimensions: 1536
      }
    ];
  }

  resolveImageSize(
    width?: number | null,
    height?: number | null
  ): string | null {
    if (!width || !height) {
      return null;
    }

    const supported: Array<[number, number]> = [
      [1024, 1024],
      [1024, 1536],
      [1536, 1024]
    ];

    const targetArea = width * height;
    const targetRatio = width / height;

    const score = (w: number, h: number): number => {
      const area = w * h;
      const ratio = w / h;
      const areaScore =
        Math.abs(area - targetArea) / Math.max(area, targetArea);
      const ratioScore = Math.abs(ratio - targetRatio);
      return areaScore * 0.7 + ratioScore * 0.3;
    };

    const best = supported.reduce((bestSoFar, candidate) =>
      score(candidate[0], candidate[1]) < score(bestSoFar[0], bestSoFar[1])
        ? candidate
        : bestSoFar
    );

    return `${best[0]}x${best[1]}`;
  }

  static resolveVideoSize(
    aspectRatio?: string | null,
    resolution?: string | null
  ): string | null {
    if (!resolution) {
      return null;
    }

    const supported: Array<[number, number]> = [
      [1280, 720],
      [1792, 1024],
      [720, 1280],
      [1024, 1792]
    ];

    const aspect = (aspectRatio ?? "16:9").replaceAll(" ", "");
    const resolutionKey = resolution.toLowerCase();

    const presets: Record<string, Record<string, string>> = {
      "16:9": { "480p": "854x480", "720p": "1280x720", "1080p": "1920x1080" },
      "9:16": { "480p": "480x854", "720p": "720x1280", "1080p": "1080x1920" },
      "1:1": { "480p": "480x480", "720p": "720x720", "1080p": "1080x1080" },
      "4:3": { "480p": "640x480", "720p": "960x720", "1080p": "1440x1080" },
      "3:4": { "480p": "480x640", "720p": "720x960", "1080p": "1080x1440" }
    };

    const score = (
      targetW: number,
      targetH: number,
      candidate: [number, number]
    ): number => {
      const [w, h] = candidate;
      const ratioDiff = Math.abs(w / h - targetW / targetH);
      const areaDiff =
        Math.abs(w * h - targetW * targetH) /
        Math.max(w * h, targetW * targetH);
      return ratioDiff * 5 + areaDiff;
    };

    const closest = (targetW: number, targetH: number): string => {
      const best = supported.reduce((bestSoFar, candidate) =>
        score(targetW, targetH, candidate) < score(targetW, targetH, bestSoFar)
          ? candidate
          : bestSoFar
      );
      return `${best[0]}x${best[1]}`;
    };

    const preset = presets[aspect]?.[resolutionKey];
    if (preset) {
      const [w, h] = preset.split("x").map(Number);
      return closest(w, h);
    }

    const numeric = Number(resolutionKey.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    const [arW, arH] = aspect.includes(":")
      ? aspect.split(":").map((n) => Number(n))
      : [1, 1];

    if (
      !Number.isFinite(arW) ||
      !Number.isFinite(arH) ||
      arW <= 0 ||
      arH <= 0
    ) {
      return null;
    }

    const targetW = arW >= arH ? numeric * (arW / arH) : numeric;
    const targetH = arW >= arH ? numeric : numeric * (arH / arW);

    return closest(
      Math.max(2, Math.round(targetW)),
      Math.max(2, Math.round(targetH))
    );
  }

  static secondsFromParams(params: {
    numFrames?: number | null;
  }): number | null {
    const numFrames = params.numFrames;
    if (!numFrames || numFrames <= 0) {
      return null;
    }

    const estimated = Math.ceil(numFrames / 24);
    if (estimated < 8) return 4;
    if (estimated < 12) return 8;
    return 12;
  }

  static snapToValidVideoDimensions(width: number, height: number): string {
    const supported: Array<[number, number]> = [
      [1280, 720],
      [720, 1280]
    ];

    const targetRatio = width / height;
    const targetArea = width * height;

    const score = ([w, h]: [number, number]): number => {
      const ratioDiff = Math.abs(w / h - targetRatio);
      const areaDiff =
        Math.abs(w * h - targetArea) / Math.max(w * h, targetArea);
      return ratioDiff * 3 + areaDiff;
    };

    const best = supported.reduce((bestSoFar, candidate) =>
      score(candidate) < score(bestSoFar) ? candidate : bestSoFar
    );

    return `${best[0]}x${best[1]}`;
  }

  static extractImageDimensions(image: Uint8Array): [number, number] {
    // PNG IHDR
    if (
      image.length >= 24 &&
      image[0] === 0x89 &&
      image[1] === 0x50 &&
      image[2] === 0x4e &&
      image[3] === 0x47
    ) {
      const view = new DataView(
        image.buffer,
        image.byteOffset,
        image.byteLength
      );
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return [width, height];
    }

    // JPEG SOF marker scan
    if (image.length >= 4 && image[0] === 0xff && image[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < image.length) {
        if (image[offset] !== 0xff) {
          offset += 1;
          continue;
        }

        const marker = image[offset + 1];
        const size = (image[offset + 2] << 8) + image[offset + 3];
        if (size < 2) {
          break;
        }

        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = (image[offset + 5] << 8) + image[offset + 6];
          const width = (image[offset + 7] << 8) + image[offset + 8];
          return [width, height];
        }

        offset += 2 + size;
      }
    }

    throw new Error("Unsupported image format for dimension extraction");
  }

  async uriToBase64(uri: string): Promise<string> {
    const resolved = await this.resolveUri(uri);
    if (resolved.startsWith("data:")) {
      return this.normalizeDataUri(resolved);
    }
    const response = await this._fetch(resolved);
    if (!response.ok) {
      throw new Error(`Failed to fetch URI: ${response.status}`);
    }

    const mime =
      response.headers.get("content-type") ?? "application/octet-stream";
    const data = new Uint8Array(await response.arrayBuffer());
    return makeDataUri(mime, data);
  }

  normalizeDataUri(uri: string): string {
    const { mime, data } = parseDataUri(uri);
    return makeDataUri(mime, data);
  }

  private async messageContentToOpenAIContentPart(
    content: MessageContent
  ): Promise<Record<string, unknown>> {
    if (content.type === "text") {
      const c = content as MessageTextContent;
      return { type: "text", text: c.text };
    }

    if (content.type === "audio") {
      const c = content as MessageAudioContent;
      const base64 = c.audio.uri
        ? (await this.uriToBase64(c.audio.uri)).split(",", 2)[1]
        : Buffer.from(asUint8Array(c.audio.data ?? new Uint8Array())).toString(
            "base64"
          );

      return {
        type: "input_audio",
        input_audio: {
          format: "mp3",
          data: base64
        }
      };
    }

    const c = content as MessageImageContent;
    const imageUrl = c.image.uri
      ? await this.uriToBase64(c.image.uri)
      : makeDataUri(
          c.image.mimeType ?? "image/jpeg",
          asUint8Array(c.image.data ?? new Uint8Array())
        );

    return {
      type: "image_url",
      image_url: { url: imageUrl }
    };
  }

  async convertMessage(message: Message): Promise<Record<string, unknown>> {
    if (message.role === "tool") {
      if (!message.toolCallId) {
        throw new Error("Tool message requires toolCallId");
      }

      let content = "";
      if (typeof message.content === "string") {
        content = message.content;
      } else if (message.content != null) {
        content = JSON.stringify(message.content, defaultSerializer);
      }

      return {
        role: "tool",
        content,
        tool_call_id: message.toolCallId
      };
    }

    if (message.role === "system") {
      return {
        role: "system",
        content: typeof message.content === "string" ? message.content : ""
      };
    }

    if (message.role === "assistant") {
      const toolCalls = (message.toolCalls ?? []).map((tc) => ({
        type: "function",
        id: tc.id,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args, defaultSerializer)
        }
      }));

      if (typeof message.content === "string" || message.content == null) {
        return {
          role: "assistant",
          content: message.content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        };
      }

      const parts = await Promise.all(
        (message.content as MessageContent[]).map((part) =>
          this.messageContentToOpenAIContentPart(part)
        )
      );

      return {
        role: "assistant",
        content: parts,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
      };
    }

    if (message.role !== "user") {
      throw new Error(`Unsupported role: ${message.role}`);
    }

    if (typeof message.content === "string") {
      return {
        role: "user",
        content: message.content
      };
    }

    const parts = await Promise.all(
      (message.content ?? []).map((part) =>
        this.messageContentToOpenAIContentPart(part)
      )
    );

    return {
      role: "user",
      content: parts
    };
  }

  formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    return tools.map((tool) => {
      if (
        tool.type === "code_interpreter" ||
        tool.name === "code_interpreter"
      ) {
        return { type: "code_interpreter" };
      }

      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: tool.inputSchema ?? { type: "object", properties: {} }
        }
      };
    });
  }

  private convertSystemToUserForOModels(
    messages: Message[],
    model: string
  ): Message[] {
    if (!model.startsWith("o")) {
      return messages;
    }

    return messages.map((msg) =>
      msg.role === "system"
        ? {
            ...msg,
            role: "user",
            content: `Instructions: ${typeof msg.content === "string" ? msg.content : ""}`
          }
        : msg
    );
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const {
      model,
      tools = [],
      maxTokens = 16384,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty,
      audio
    } = args;

    const messages = this.convertSystemToUserForOModels(args.messages, model);
    const openaiMessages = await Promise.all(
      messages.map((m) => this.convertMessage(m))
    );

    const request: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      max_completion_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true }
    };

    const hasTools =
      tools.length > 0 && (await this.hasToolSupport(model));

    if (temperature != null) request.temperature = temperature;
    if (topP != null) request.top_p = topP;
    if (presencePenalty != null) request.presence_penalty = presencePenalty;
    if (frequencyPenalty != null) request.frequency_penalty = frequencyPenalty;

    if (audio) {
      request.audio = audio;
      request.modalities = ["text", "audio"];
    }

    if (hasTools) {
      request.tools = this.formatTools(tools);
    }

    log.debug("OpenAI request", { model });

    const stream = (await this.getClient().chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
    )) as AsyncIterable<any> & { close?: () => Promise<void> };

    const deltaToolCalls = new Map<number, MutableToolCall>();

    try {
      for await (const chunk of stream) {
        if (chunk?.usage) {
          this.trackUsage(model, {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
          });
        }

        const choice = chunk?.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta?.audio?.data) {
          const audioChunk: Chunk = {
            type: "chunk",
            content_type: "audio",
            content: String(delta.audio.data)
          };
          yield audioChunk;
        }

        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = Number(tc.index ?? 0);
            const current = deltaToolCalls.get(index) ?? {
              id: String(tc.id ?? ""),
              name: String(tc.function?.name ?? ""),
              arguments: ""
            };

            if (tc.id) current.id = String(tc.id);
            if (tc.function?.name) current.name = String(tc.function.name);
            if (tc.function?.arguments)
              current.arguments += String(tc.function.arguments);

            deltaToolCalls.set(index, current);
          }
        }

        if (delta?.content !== undefined || choice.finish_reason === "stop") {
          const item: Chunk = {
            type: "chunk",
            content: String(delta?.content ?? ""),
            done: choice.finish_reason === "stop"
          };
          yield item;
        }

        if (choice.finish_reason === "tool_calls") {
          for (const call of deltaToolCalls.values()) {
            const toolCall: ToolCall = this.buildToolCall(
              call.id,
              call.name,
              call.arguments
            );
            yield toolCall;
          }
          deltaToolCalls.clear();
        }
      }
    } finally {
      if (typeof stream.close === "function") {
        await stream.close();
      }
    }
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const {
      model,
      tools = [],
      toolChoice,
      maxTokens = 16384,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty
    } = args;

    const messages = this.convertSystemToUserForOModels(args.messages, model);
    const openaiMessages = await Promise.all(
      messages.map((m) => this.convertMessage(m))
    );

    const request: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      stream: false,
      max_completion_tokens: maxTokens
    };

    const hasTools =
      tools.length > 0 && (await this.hasToolSupport(model));

    if (temperature != null) request.temperature = temperature;
    if (topP != null) request.top_p = topP;
    if (presencePenalty != null) request.presence_penalty = presencePenalty;
    if (frequencyPenalty != null) request.frequency_penalty = frequencyPenalty;

    if (hasTools) {
      request.tools = this.formatTools(tools);
      if (toolChoice) {
        request.tool_choice =
          toolChoice === "any"
            ? "required"
            : { type: "function", function: { name: toolChoice } };
      }
    }

    log.debug("OpenAI request", { model });

    const completion = await this.getClient().chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );

    const choice = completion.choices?.[0];
    if (!choice) {
      throw new Error("OpenAI returned no choices");
    }

    const usage = (completion as any).usage;
    if (usage) {
      this.trackUsage(model, {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0
      });
    }

    const responseMessage = choice.message;

    const toolCalls = Array.isArray(responseMessage.tool_calls)
      ? responseMessage.tool_calls
          .filter(
            (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
              tc.type === "function"
          )
          .map((tc) =>
            this.buildToolCall(tc.id, tc.function.name, tc.function.arguments)
          )
      : undefined;

    return {
      role: "assistant",
      content: responseMessage.content ?? null,
      toolCalls
    };
  }

  async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt
    };

    const size = this.resolveImageSize(
      params.width ?? undefined,
      params.height ?? undefined
    );
    if (size) request.size = size;
    if (params.quality) request.quality = params.quality;

    const response = (await this.getClient().images.generate(
      request as unknown as OpenAI.Images.ImageGenerateParams
    )) as OpenAI.Images.ImagesResponse;

    const item = response.data?.[0];
    if (!item) {
      throw new Error("OpenAI image generation returned no image data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this._fetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("OpenAI image generation returned no image data.");
  }

  async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty.");
    }
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    const request: Record<string, unknown> = {
      model: params.model.id,
      image: await toFile(Buffer.from(image), "image.png", {
        type: "image/png"
      }),
      prompt
    };

    const size = this.resolveImageSize(
      params.targetWidth ?? undefined,
      params.targetHeight ?? undefined
    );
    if (size) request.size = size;
    if (params.quality) request.quality = params.quality;

    const response = (await this.getClient().images.edit(
      request as unknown as OpenAI.Images.ImageEditParams
    )) as OpenAI.Images.ImagesResponse;

    const item = response.data?.[0];
    if (!item) {
      throw new Error("OpenAI image editing returned no image data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this._fetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("OpenAI image editing returned no image data.");
  }

  async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const voice = args.voice ?? "alloy";
    const speed = Math.max(0.25, Math.min(4.0, args.speed ?? 1.0));

    const speechApi = this.getClient().audio.speech as any;

    if (speechApi.with_streaming_response?.create) {
      const response = await speechApi.with_streaming_response.create({
        model: args.model,
        input: args.text,
        voice,
        speed,
        response_format: "pcm"
      });

      for await (const chunk of response.iterBytes(4096)) {
        const bytes = asUint8Array(chunk);
        yield { samples: toInt16Samples(bytes) };
      }
      return;
    }

    const response = await speechApi.create({
      model: args.model,
      input: args.text,
      voice,
      speed,
      response_format: "pcm"
    });

    const bytes = asUint8Array(
      typeof response.arrayBuffer === "function"
        ? await response.arrayBuffer()
        : response
    );
    yield { samples: toInt16Samples(bytes) };
  }

  /**
   * OpenAI supports several fully-encoded TTS formats directly (mp3, opus,
   * aac, flac, wav). Use this path when the caller has requested one of them
   * so we can skip the PCM → WAV wrapping step and honor the user's choice.
   * For `"pcm"` (and anything unrecognised) we return `null` and let the
   * streaming PCM path handle it.
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const fmt = (args.audioFormat ?? "").toLowerCase();
    const formatToMime: Record<string, string> = {
      mp3: "audio/mpeg",
      opus: "audio/ogg",
      aac: "audio/aac",
      flac: "audio/flac",
      wav: "audio/wav"
    };
    if (!(fmt in formatToMime)) {
      return null;
    }

    const voice = args.voice ?? "alloy";
    const speed = Math.max(0.25, Math.min(4.0, args.speed ?? 1.0));

    const speechApi = this.getClient().audio.speech as any;
    const response = await speechApi.create({
      model: args.model,
      input: args.text,
      voice,
      speed,
      response_format: fmt
    });

    const bytes = asUint8Array(
      typeof response.arrayBuffer === "function"
        ? await response.arrayBuffer()
        : response
    );
    return { data: bytes, mimeType: formatToMime[fmt] };
  }

  async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<import("./types.js").ASRResult> {
    if (!args.audio || args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }

    const temperature = Math.max(0, Math.min(1, args.temperature ?? 0));

    const audioPart = new Uint8Array(args.audio);
    const fileLike =
      typeof File !== "undefined"
        ? new File([audioPart], "audio.mp3", { type: "audio/mpeg" })
        : Object.assign(new Blob([audioPart], { type: "audio/mpeg" }), {
            name: "audio.mp3"
          });

    const requestParams: Record<string, unknown> = {
      file: fileLike,
      model: args.model,
      language: args.language,
      prompt: args.prompt,
      temperature
    };

    if (args.word_timestamps) {
      requestParams.response_format = "verbose_json";
      requestParams.timestamp_granularities = ["word", "segment"];
    }

    const response = await (
      this.getClient().audio.transcriptions as any
    ).create(requestParams);

    const text = String(response.text ?? "");

    if (!args.word_timestamps) {
      return { text };
    }

    const chunks: import("./types.js").AudioChunk[] = [];
    const rawWords = response.words as
      | Array<{ start: number; end: number; word: string }>
      | undefined;
    if (rawWords) {
      for (const w of rawWords) {
        chunks.push({
          timestamp: [w.start, w.end],
          text: w.word
        });
      }
    } else {
      const rawSegments = response.segments as
        | Array<{ start: number; end: number; text: string }>
        | undefined;
      if (rawSegments) {
        for (const s of rawSegments) {
          chunks.push({
            timestamp: [s.start, s.end],
            text: s.text
          });
        }
      }
    }

    return { text, chunks: chunks.length > 0 ? chunks : undefined };
  }

  async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const size = OpenAIProvider.resolveVideoSize(
      params.aspectRatio,
      params.resolution
    );
    const seconds = OpenAIProvider.secondsFromParams(params) ?? 4;

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt,
      size: size ?? "1024x1024",
      seconds: String(seconds)
    };

    const video = await this.getClient().videos.create(
      request as unknown as OpenAI.Videos.VideoCreateParams
    );
    if (!video?.id) {
      throw new Error(
        "OpenAI video create response did not contain a video id"
      );
    }

    const timeoutMs = 10 * 60 * 1000;
    const intervalMs = 2000;
    const start = Date.now();

    let latest = video;
    while (latest.status === "queued" || latest.status === "in_progress") {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Video generation timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      latest = await this.getClient().videos.retrieve(video.id);
    }

    if (latest.status !== "completed") {
      throw new Error(
        String(
          latest.error ??
            `Video generation ended with status '${latest.status}'`
        )
      );
    }

    const contentResponse = await this.getClient().videos.downloadContent(
      video.id,
      { variant: "video" }
    );
    return new Uint8Array(await contentResponse.arrayBuffer());
  }

  async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("The input image cannot be empty.");
    }

    const [width, height] = OpenAIProvider.extractImageDimensions(image);
    const requestedSize = OpenAIProvider.resolveVideoSize(
      params.aspectRatio,
      params.resolution
    );
    const size =
      requestedSize ?? OpenAIProvider.snapToValidVideoDimensions(width, height);
    const seconds = OpenAIProvider.secondsFromParams(params) ?? 4;

    const [targetW, targetH] = size.split("x").map(Number);
    const sharp = (await import("sharp")).default;
    const resized =
      width === targetW && height === targetH
        ? image
        : new Uint8Array(
            await sharp(image)
              .resize(targetW, targetH, { fit: "cover", position: "centre" })
              .png()
              .toBuffer()
          );

    const video = await this.getClient().videos.create({
      model: params.model.id as OpenAI.Videos.VideoModel,
      prompt: params.prompt ?? "",
      input_reference: await toFile(Buffer.from(resized), "input_image.png", {
        type: "image/png"
      }),
      size: size as OpenAI.Videos.VideoSize,
      seconds: String(seconds) as OpenAI.Videos.VideoSeconds
    });

    if (!video?.id) {
      throw new Error(
        "OpenAI image-to-video create response did not contain a video id"
      );
    }

    const timeoutMs = 10 * 60 * 1000;
    const intervalMs = 2000;
    const start = Date.now();

    let latest = video;
    while (latest.status === "queued" || latest.status === "in_progress") {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Image-to-video generation timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      latest = await this.getClient().videos.retrieve(video.id);
    }

    if (latest.status !== "completed") {
      throw new Error(
        String(
          latest.error ??
            `Image-to-video generation ended with status '${latest.status}'`
        )
      );
    }

    const contentResponse = await this.getClient().videos.downloadContent(
      video.id,
      { variant: "video" }
    );
    return new Uint8Array(await contentResponse.arrayBuffer());
  }

  async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const input = Array.isArray(args.text) ? args.text : [args.text];
    if (input.length === 0 || input.every((v) => !v)) {
      throw new Error("text must not be empty");
    }

    const response = await this.getClient().embeddings.create({
      model: args.model,
      input,
      ...(args.dimensions ? { dimensions: args.dimensions } : {})
    });

    return response.data.map((row) => row.embedding as number[]);
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return msg.includes("context length") || msg.includes("maximum context");
  }
}
