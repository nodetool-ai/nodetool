import type OpenAI from "openai";
import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { fetchWithRetry, pollUntilTerminal } from "./http-transport.js";
import { bytesToImageDataUri } from "./image-mime.js";
import { sniffAudioMimeOrNull } from "./audio-mime.js";
import type {
  ASRModel,
  ASRResult,
  AudioChunk,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";
import { isString } from "@nodetool-ai/protocol";
import type { ProviderCapability } from "./base-provider.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.openrouter");

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Attribution headers sent with every OpenRouter request. */
const OPENROUTER_HEADERS: Record<string, string> = {
  // Stryker disable next-line StringLiteral
  "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
  // Stryker disable next-line StringLiteral
  "X-Title": "NodeTool"
};

/** Known image-capable models on OpenRouter. */
const OPENROUTER_IMAGE_MODELS: ImageModel[] = [
  {
    id: "stabilityai/stable-diffusion-xl",
    name: "Stable Diffusion XL",
    provider: "openrouter",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    provider: "openrouter",
    supportedTasks: ["text_to_image", "image_to_image"]
  }
];

const VIDEO_POLL_INTERVAL_MS = 5000;
/** Default polling window when the caller sets no timeout. */
const VIDEO_DEFAULT_TIMEOUT_SECONDS = 20 * 60;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === "number")
    : [];
}

/** `input_audio.format` values OpenRouter accepts, by sniffed MIME type. */
const AUDIO_FORMAT_BY_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac"
};

function architectureOf(row: Record<string, unknown>): Record<string, unknown> {
  const architecture = row.architecture;
  return architecture && typeof architecture === "object"
    ? (architecture as Record<string, unknown>)
    : {};
}

/** The enum values of one `supported_parameters` entry, or `[]`. */
function parameterValues(row: Record<string, unknown>, name: string): string[] {
  const parameters = row.supported_parameters;
  if (!parameters || typeof parameters !== "object") return [];
  const entry = (parameters as Record<string, unknown>)[name];
  if (!entry || typeof entry !== "object") return [];
  return stringList((entry as { values?: unknown }).values);
}

function withNegativePrompt(
  prompt: string,
  negativePrompt: string | null | undefined
): string {
  return negativePrompt
    ? `${prompt.trim()}\n\nDo not include: ${negativePrompt.trim()}`
    : prompt;
}

/** The message OpenRouter puts in `error` (a string or `{ message }`). */
function errorText(body: Record<string, unknown>): string {
  const error = body.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return JSON.stringify(body).slice(0, 500);
}

function reportedCost(body: Record<string, unknown>): number | undefined {
  const usage = body.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const cost = (usage as { cost?: unknown }).cost;
  return typeof cost === "number" ? cost : undefined;
}

export class OpenRouterProvider extends OpenAICompatProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "text_to_speech",
      "automatic_speech_recognition",
      "generate_embedding"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["OPENROUTER_API_KEY"];
  }

  constructor(
    secrets: { OPENROUTER_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required");
    }

    super(
      {
        providerId: "openrouter",
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        // Attribution headers ride every chat request (and the SDK fallback);
        // the same header values are asserted on the /models fetch below.
        defaultHeaders: OPENROUTER_HEADERS
      },
      options
    );
  }

  override getContainerEnv() {
    return { OPENROUTER_API_KEY: this.apiKey };
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    const lower = model.toLowerCase();
    if (lower.includes("o1") || lower.includes("o3")) {
      return false;
    }
    return true;
  }

  /**
   * Convert system messages to user messages for o1/o3 models
   * which do not support the system role.
   */
  private convertSystemToUserForReasoningModels(
    messages: Message[],
    model: string
  ): Message[] {
    const lower = model.toLowerCase();
    if (!lower.includes("o1") && !lower.includes("o3")) {
      return messages;
    }
    return messages.map((msg) =>
      msg.role === "system"
        ? {
            ...msg,
            role: "user" as const,
            content: `Instructions: ${isString(msg.content) ? msg.content : ""}`
          }
        : msg
    );
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const convertedMessages = this.convertSystemToUserForReasoningModels(
      args.messages,
      args.model
    );
    return super.generateMessage({ ...args, messages: convertedMessages });
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
  }): AsyncGenerator<ProviderStreamItem> {
    const convertedMessages = this.convertSystemToUserForReasoningModels(
      args.messages,
      args.model
    );
    yield* super.generateMessages({ ...args, messages: convertedMessages });
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const size = this.resolveImageSize(
      params.width ?? undefined,
      params.height ?? undefined
    );
    return this.generateImage(params, [], size);
  }

  /**
   * Edit or compose from source images. OpenRouter's image API takes them as
   * `input_references`; entity reference images arrive here already appended
   * to `images` by the base provider.
   */
  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const size = this.resolveImageSize(
      params.targetWidth ?? undefined,
      params.targetHeight ?? undefined
    );
    return this.generateImage(params, images, size);
  }

  private async generateImage(
    params: TextToImageParams | ImageToImageParams,
    inputs: readonly Uint8Array[],
    size: string | null
  ): Promise<Uint8Array> {
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

    if (size) request.size = size;
    if (params.quality) request.quality = params.quality;
    // Gemini image models ignore `size`; OpenRouter reads the shape from here.
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;
    if (inputs.length > 0) {
      request.input_references = inputs.map((bytes) => ({
        type: "image_url",
        image_url: { url: bytesToImageDataUri(bytes) }
      }));
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("OpenRouter image generation", {
      model: params.model.id,
      inputs: inputs.length
    });

    // SAFETY: a dictionary request against the OpenAI SDK's closed image
    // params; OpenRouter is driven through the same client.
    const response = (await this.getClient().images.generate(
      request as unknown as OpenAI.Images.ImageGenerateParams
    )) as OpenAI.Images.ImagesResponse;

    const item = response.data?.[0];
    if (!item) {
      throw new Error("OpenRouter image generation returned no image data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this.compatFetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("OpenRouter image generation returned no image data.");
  }

  /**
   * Video models are listed under `/videos/models`, not `/models`. A model
   * without durations (an editor) or with an upscale factor (an upscaler)
   * cannot render from a prompt, so it is left out.
   */
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const rows = await this.fetchCompatModelRows(
      `${OPENROUTER_BASE_URL}/videos/models`
    );
    const models: VideoModel[] = [];
    for (const row of rows) {
      const durations = numberList(row.supported_durations);
      if (durations.length === 0 || row.upscale_factor != null) continue;
      const supportedTasks = ["text_to_video"];
      if (stringList(row.supported_frame_images).includes("first_frame")) {
        supportedTasks.push("image_to_video");
      }
      const model: VideoModel = {
        id: row.id,
        name: typeof row.name === "string" ? row.name : row.id,
        provider: "openrouter",
        supportedTasks,
        durations
      };
      const resolutions = stringList(row.supported_resolutions);
      if (resolutions.length > 0) model.resolutions = resolutions;
      const aspectRatios = stringList(row.supported_aspect_ratios);
      if (aspectRatios.length > 0) model.aspectRatios = aspectRatios;
      models.push(model);
    }
    return models;
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }
    return this.generateVideo(params, {});
  }

  /**
   * Animate a start frame. OpenRouter takes it as a data URI in
   * `frame_images`, plus an optional `last_frame` for interpolation.
   */
  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (image.length === 0) {
      throw new Error("imageToVideo requires a start frame");
    }
    const frames: Record<string, unknown>[] = [
      {
        type: "image_url",
        image_url: { url: bytesToImageDataUri(image) },
        frame_type: "first_frame"
      }
    ];
    if (params.endImage && params.endImage.length > 0) {
      frames.push({
        type: "image_url",
        image_url: { url: bytesToImageDataUri(params.endImage) },
        frame_type: "last_frame"
      });
    }
    return this.generateVideo(params, { frame_images: frames });
  }

  /**
   * Image models come from `/images/models`, with per-model aspect ratio and
   * resolution enums. The built-in list is the fallback when the listing is
   * unreachable, so the picker is never empty.
   */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const rows = await this.fetchCompatModelRows(
      `${OPENROUTER_BASE_URL}/images/models`
    );
    if (rows.length === 0) return OPENROUTER_IMAGE_MODELS;
    return rows.map((row) => {
      const supportedTasks = ["text_to_image"];
      if (stringList(architectureOf(row).input_modalities).includes("image")) {
        supportedTasks.push("image_to_image");
      }
      const model: ImageModel = {
        id: row.id,
        name: typeof row.name === "string" ? row.name : row.id,
        provider: "openrouter",
        supportedTasks
      };
      const aspectRatios = parameterValues(row, "aspect_ratio");
      if (aspectRatios.length > 0) model.aspectRatios = aspectRatios;
      const resolutions = parameterValues(row, "resolution");
      if (resolutions.length > 0) model.resolutions = resolutions;
      return model;
    });
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }

  /** Speech models are `/models` rows whose output modality is `speech`. */
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    const rows = await this.fetchCompatModelRows(
      `${OPENROUTER_BASE_URL}/models?output_modalities=speech`
    );
    return rows.map((row) => {
      const model: TTSModel = {
        id: row.id,
        name: typeof row.name === "string" ? row.name : row.id,
        provider: "openrouter"
      };
      const voices = stringList(row.supported_voices);
      if (voices.length > 0) model.voices = voices;
      return model;
    });
  }

  /** Transcription models are `/models` rows with output modality `transcription`. */
  override async getAvailableASRModels(): Promise<ASRModel[]> {
    const rows = await this.fetchCompatModelRows(
      `${OPENROUTER_BASE_URL}/models?output_modalities=transcription`
    );
    return rows.map((row) => ({
      id: row.id,
      name: typeof row.name === "string" ? row.name : row.id,
      provider: "openrouter"
    }));
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    const rows = await this.fetchCompatModelRows(
      `${OPENROUTER_BASE_URL}/embeddings/models`
    );
    return rows.map((row) => ({
      id: row.id,
      name: typeof row.name === "string" ? row.name : row.id,
      provider: "openrouter"
    }));
  }

  /**
   * OpenRouter transcribes from a JSON body with base64 `input_audio`, not the
   * multipart upload the inherited OpenAI path sends. `prompt` has no
   * OpenRouter field and is ignored.
   */
  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    if (!args.audio || args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    const mime = sniffAudioMimeOrNull(args.audio);
    const request: Record<string, unknown> = {
      model: args.model,
      input_audio: {
        data: Buffer.from(args.audio).toString("base64"),
        format: (mime && AUDIO_FORMAT_BY_MIME[mime]) ?? "mp3"
      }
    };
    if (args.language) request.language = args.language;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.word_timestamps) {
      request.response_format = "verbose_json";
      request.timestamp_granularities = ["word"];
    }

    const res = await this.compatFetch(
      `${OPENROUTER_BASE_URL}/audio/transcriptions`,
      {
        method: "POST",
        headers: this.openRouterHeaders(),
        body: JSON.stringify(request)
      }
    );
    if (!res.ok) {
      throw new Error(
        `OpenRouter transcription failed: ${res.status} ${(await res.text()).slice(0, 500)}`
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    const usage = body.usage as { seconds?: unknown } | undefined;
    if (typeof usage?.seconds === "number") {
      this.trackUsage(args.model, { durationSeconds: usage.seconds });
    }

    const text = typeof body.text === "string" ? body.text : "";
    if (!args.word_timestamps) return { text };
    const chunks: AudioChunk[] = [];
    for (const word of Array.isArray(body.words) ? body.words : []) {
      if (
        word &&
        typeof word.word === "string" &&
        typeof word.start === "number" &&
        typeof word.end === "number"
      ) {
        chunks.push({ timestamp: [word.start, word.end], text: word.word });
      }
    }
    return chunks.length > 0 ? { text, chunks } : { text };
  }

  private openRouterHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...OPENROUTER_HEADERS
    };
  }

  /**
   * Submit to `POST /videos`, poll the job, and download its first output.
   * The status and content URLs are built from the job id rather than taken
   * from the response, so the API key is only ever sent to OpenRouter.
   */
  private async generateVideo(
    params: TextToVideoParams | ImageToVideoParams,
    extra: Record<string, unknown>
  ): Promise<Uint8Array> {
    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: withNegativePrompt(params.prompt ?? "", params.negativePrompt),
      ...extra
    };
    if (params.durationSeconds) {
      request.duration = Math.round(params.durationSeconds);
    }
    if (params.resolution) request.resolution = params.resolution;
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.seed != null && params.seed >= 0) request.seed = params.seed;

    const timeoutSeconds =
      params.timeoutSeconds && params.timeoutSeconds > 0
        ? params.timeoutSeconds
        : VIDEO_DEFAULT_TIMEOUT_SECONDS;
    const timeout = AbortSignal.timeout(timeoutSeconds * 1000);
    const signal = params.signal
      ? AbortSignal.any([params.signal, timeout])
      : timeout;

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("OpenRouter video submit", { model: params.model.id });

    const submit = await this.compatFetch(`${OPENROUTER_BASE_URL}/videos`, {
      method: "POST",
      headers: this.openRouterHeaders(),
      body: JSON.stringify(request),
      signal
    });
    if (!submit.ok) {
      throw new Error(
        `OpenRouter video submit failed: ${submit.status} ${(await submit.text()).slice(0, 500)}`
      );
    }
    const submitted = (await submit.json()) as Record<string, unknown>;
    const jobId = submitted.id;
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error(
        `OpenRouter video submit returned no job id: ${JSON.stringify(submitted).slice(0, 500)}`
      );
    }
    const jobUrl = `${OPENROUTER_BASE_URL}/videos/${encodeURIComponent(jobId)}`;

    const done = await pollUntilTerminal<Record<string, unknown>>(
      async () => {
        // The job is already submitted and billed: a 429 or a gateway 5xx on
        // the status GET must back off, not throw the job away.
        const res = await fetchWithRetry(
          jobUrl,
          { headers: this.openRouterHeaders(), signal },
          { fetchImpl: this.compatFetch }
        );
        if (!res.ok) {
          throw new Error(
            `OpenRouter video status failed: ${res.status} ${(await res.text()).slice(0, 500)}`
          );
        }
        return (await res.json()) as Record<string, unknown>;
      },
      {
        intervalMs: VIDEO_POLL_INTERVAL_MS,
        maxAttempts: Math.max(
          1,
          Math.ceil((timeoutSeconds * 1000) / VIDEO_POLL_INTERVAL_MS)
        ),
        signal,
        onFailure: (body) =>
          new Error(`OpenRouter video job ${jobId} failed: ${errorText(body)}`),
        onTimeout: () =>
          new Error(
            `OpenRouter video job ${jobId} did not finish within ${timeoutSeconds}s`
          )
      }
    );
    const cost = reportedCost(done);
    if (cost !== undefined) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.info("OpenRouter video cost", { model: params.model.id, cost });
    }

    const content = await this.compatFetch(`${jobUrl}/content?index=0`, {
      headers: this.openRouterHeaders(),
      signal
    });
    if (!content.ok) {
      throw new Error(
        `OpenRouter video download failed: ${content.status} ${(await content.text()).slice(0, 500)}`
      );
    }
    return new Uint8Array(await content.arrayBuffer());
  }
}
