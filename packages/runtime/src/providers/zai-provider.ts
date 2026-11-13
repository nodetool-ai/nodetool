/**
 * Z.ai (Zhipu) provider: GLM chat over the OpenAI-compatible
 * `/chat/completions`, GLM-Image over `/images/generations`, CogVideoX over
 * `/videos/generations` + `/async-result/{id}`, and GLM-ASR over
 * `/audio/transcriptions`.
 *
 * Built from the published OpenAPI spec (https://docs.z.ai/openapi.json,
 * server `https://api.z.ai/api`, every path under `/paas/v4`). The China host
 * (open.bigmodel.cn) serves the same API under the same paths.
 */
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { ChatCompletionsRequest } from "./openai-compat/index.js";
import type { ProviderCapability } from "./base-provider.js";
import {
  fetchWithRetry,
  pollUntilTerminal,
  type PollUntilTerminalOptions
} from "./http-transport.js";
import { sniffImageMime } from "./image-mime.js";
import { sniffAudioMimeOrNull } from "./audio-mime.js";
import { safeFetch } from "./safe-url.js";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import type {
  ASRModel,
  ASRResult,
  EmbeddingModel,
  ImageModel,
  ImageToVideoParams,
  LanguageModel,
  TextToImageParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.zai");

export const ZAI_BASE_URLS = {
  international: "https://api.z.ai/api/paas/v4",
  china: "https://open.bigmodel.cn/api/paas/v4"
} as const;

export type ZaiRegion = keyof typeof ZAI_BASE_URLS;

/** `ZAI_REGION` → API root. Empty or unknown values use the international host. */
export function resolveZaiBaseURL(region?: string | null): string {
  const key = (region ?? "").trim().toLowerCase();
  return key === "china" ? ZAI_BASE_URLS.china : ZAI_BASE_URLS.international;
}

// Z.ai publishes no model-listing endpoint (the OpenAPI spec has no
// `/models` path), so these ids are copied from the `model` enums of the
// chat request schemas in https://docs.z.ai/openapi.json.
const TEXT_MODELS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "glm-5.3", name: "GLM-5.3" },
  { id: "glm-5.2", name: "GLM-5.2" },
  { id: "glm-5.1", name: "GLM-5.1" },
  { id: "glm-5", name: "GLM-5" },
  { id: "glm-4.7", name: "GLM-4.7" },
  { id: "glm-4.6", name: "GLM-4.6" }
];
const VISION_MODELS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "glm-5.3-flash", name: "GLM-5.3-Flash" },
  { id: "glm-5.3-flashx", name: "GLM-5.3-FlashX" },
  { id: "glm-5.3-flashx-legal", name: "GLM-5.3-FlashX-Legal" }
];

/** The `CreateImageRequest.model` enum has one value. */
const IMAGE_MODEL_ID = "glm-image";
/** Recommended glm-image sizes from the `size` description, as [w, h]. */
const GLM_IMAGE_SIZES: ReadonlyArray<[number, number]> = [
  [1280, 1280],
  [1568, 1056],
  [1056, 1568],
  [1472, 1088],
  [1088, 1472],
  [1728, 960],
  [960, 1728]
];

/** The `CogVideoX3Request.model` enum has one value. */
const VIDEO_MODEL_ID = "cogvideox-3";
const VIDEO_DURATIONS = [5, 10];
const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
const VIDEO_RESOLUTIONS = ["720p", "1080p", "4k"];
/** `CogVideoX3Request.size` enum, indexed by aspect ratio then resolution. */
const VIDEO_SIZES: Record<string, Record<string, string>> = {
  "16:9": { "720p": "1280x720", "1080p": "1920x1080", "4k": "3840x2160" },
  "9:16": { "720p": "720x1280", "1080p": "1080x1920", "4k": "1080x1920" },
  "1:1": { "720p": "1024x1024", "1080p": "1024x1024", "4k": "1024x1024" }
};
const VIDEO_PROMPT_MAX_CHARS = 512;
const VIDEO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_IMAGE_MIMES = new Set(["image/png", "image/jpeg"]);
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_DEFAULT_TIMEOUT_SECONDS = 20 * 60;

const ASR_MODEL_ID = "glm-asr-2512";
const ASR_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The error text Z.ai sent. The API-code page documents
 * `{"error": {"code", "message"}}`; the per-endpoint schemas document a flat
 * `{"code", "message"}`. Both are read.
 */
function zaiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const inner =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : record;
    const message = typeof inner.message === "string" ? inner.message : "";
    const code =
      typeof inner.code === "string" || typeof inner.code === "number"
        ? String(inner.code)
        : "";
    if (message || code) {
      return code ? `${message || "error"} (code ${code})` : message;
    }
  }
  if (typeof payload === "string" && payload) return payload;
  return `HTTP ${status}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Nearest documented glm-image size to the requested shape. */
export function chooseGlmImageSize(
  width?: number | null,
  height?: number | null,
  aspectRatio?: string | null
): string {
  let ratio: number | null = null;
  if (width && height && width > 0 && height > 0) {
    ratio = width / height;
  } else if (aspectRatio) {
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio.trim());
    if (match && Number(match[2]) > 0) ratio = Number(match[1]) / Number(match[2]);
  }
  if (ratio === null) return "1280x1280";
  let best = GLM_IMAGE_SIZES[0];
  for (const size of GLM_IMAGE_SIZES) {
    const diff = Math.abs(Math.log(size[0] / size[1]) - Math.log(ratio));
    const bestDiff = Math.abs(Math.log(best[0] / best[1]) - Math.log(ratio));
    if (diff < bestDiff) best = size;
  }
  return `${best[0]}x${best[1]}`;
}

/** The `size` enum value for an aspect ratio and resolution, or undefined. */
export function chooseCogVideoSize(
  aspectRatio?: string | null,
  resolution?: string | null
): string | undefined {
  if (!aspectRatio && !resolution) return undefined;
  const sizes = VIDEO_SIZES[aspectRatio?.trim() ?? "16:9"];
  if (!sizes) return undefined;
  const r = (resolution ?? "").toLowerCase();
  if (r.includes("2160") || r.includes("4k")) return sizes["4k"];
  if (r.includes("1080")) return sizes["1080p"];
  return sizes["720p"];
}

/**
 * Z.ai GLM provider. Chat runs on the shared OpenAI-compatible client; the
 * media surfaces call Z.ai's own endpoints directly.
 */
export class ZaiProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["ZAI_API_KEY"];
  }

  private readonly _zaiFetch: typeof fetch;
  private readonly _zaiBaseURL: string;

  constructor(
    secrets: { ZAI_API_KEY?: string; ZAI_REGION?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.ZAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ZAI_API_KEY is not configured");
    }
    const baseURL = resolveZaiBaseURL(secrets.ZAI_REGION);
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    super(
      { providerId: PROVIDER_IDS.ZAI, apiKey, baseURL },
      { ...options, fetchFn }
    );
    this._zaiFetch = fetchFn;
    this._zaiBaseURL = baseURL;
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "text_to_video",
      "image_to_video",
      "automatic_speech_recognition"
    ];
  }

  override getContainerEnv(): Record<string, string> {
    return { ZAI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [...TEXT_MODELS, ...VISION_MODELS].map((model) => ({
      ...model,
      provider: PROVIDER_IDS.ZAI
    }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: IMAGE_MODEL_ID,
        name: "GLM-Image",
        provider: PROVIDER_IDS.ZAI,
        supportedTasks: ["text_to_image"]
      }
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: VIDEO_MODEL_ID,
        name: "CogVideoX-3",
        provider: PROVIDER_IDS.ZAI,
        supportedTasks: ["text_to_video", "image_to_video"],
        durations: VIDEO_DURATIONS,
        resolutions: VIDEO_RESOLUTIONS,
        aspectRatios: VIDEO_ASPECT_RATIOS,
        endFrame: "optional"
      }
    ];
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [{ id: ASR_MODEL_ID, name: "GLM-ASR-2512", provider: PROVIDER_IDS.ZAI }];
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [];
  }

  /**
   * Fit the request to `ChatCompletionTextRequest`: the cap is `max_tokens`,
   * `tool_choice` accepts only `"auto"`, `temperature` is 0.0–1.0, and the
   * schema has no `stream_options` or penalty fields.
   */
  protected override transformChatRequest(
    request: ChatCompletionsRequest
  ): ChatCompletionsRequest {
    const {
      max_completion_tokens,
      stream_options: _streamOptions,
      presence_penalty: _presence,
      frequency_penalty: _frequency,
      tool_choice,
      ...rest
    } = request;
    const out: ChatCompletionsRequest = { ...rest };
    if (max_completion_tokens !== undefined) out.max_tokens = max_completion_tokens;
    if (tool_choice === "auto") out.tool_choice = tool_choice;
    if (typeof out.temperature === "number") {
      out.temperature = Math.min(1, Math.max(0, out.temperature));
    }
    return out;
  }

  private headers(json: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`
    };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  /** POST JSON to `<base>/<path>`. Never retried: every call here is billed. */
  private async postJson(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body)
    };
    if (signal) init.signal = signal;
    const response = await this._zaiFetch(`${this._zaiBaseURL}/${path}`, init);
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(
        `Z.ai ${path} failed: ${zaiErrorMessage(payload, response.status)}`
      );
    }
    return asRecord(payload);
  }

  /**
   * Download a result URL from a Z.ai response. The generation is already
   * billed, so transient CDN failures retry. safeFetch blocks private targets.
   */
  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const init: RequestInit = {};
    if (signal) init.signal = signal;
    const response = await fetchWithRetry(url, init, {
      fetchImpl: async (input, requestInit) => {
        const res = await safeFetch(String(input), requestInit, 5, this._zaiFetch);
        if (!res.ok) return res;
        return new Response(await res.arrayBuffer(), {
          status: res.status,
          headers: res.headers
        });
      }
    });
    if (!response.ok) {
      throw new Error(`Z.ai result download failed: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Image: POST /images/generations (synchronous, one image per call)
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) {
      throw new Error("Z.ai image generation requires a prompt");
    }
    const model = params.model.id || IMAGE_MODEL_ID;
    if (model !== IMAGE_MODEL_ID) {
      throw new Error(`Z.ai image model ${model} is not supported`);
    }
    // The schema has no negative prompt field.
    const prompt = params.negativePrompt?.trim()
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;
    const body: Record<string, unknown> = {
      model,
      prompt,
      size: chooseGlmImageSize(params.width, params.height, params.aspectRatio)
    };
    if (params.quality === "hd" || params.quality === "standard") {
      body.quality = params.quality;
    }
    log.debug("Z.ai textToImage", { model, size: body.size });
    const data = await this.postJson("images/generations", body, params.signal);
    const rows = Array.isArray(data.data) ? data.data : [];
    const url = asRecord(rows[0]).url;
    if (typeof url !== "string" || !url) {
      throw new Error("Z.ai images/generations returned no image URL");
    }
    return this.download(url, params.signal);
  }

  // ---------------------------------------------------------------------------
  // Video: POST /videos/generations, then poll GET /async-result/{id}
  // ---------------------------------------------------------------------------

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) {
      throw new Error("Z.ai text-to-video requires a prompt");
    }
    return this.generateVideo(this.videoBody(params), params);
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (image.length === 0) {
      throw new Error("Z.ai image-to-video requires a first frame");
    }
    const frames = [this.videoImage(image, "first frame")];
    const body = this.videoBody(params);
    if (params.endImage && params.endImage.length > 0) {
      frames.push(this.videoImage(params.endImage, "last frame"));
      // First/last-frame mode supports only the `speed` quality.
      body.quality = "speed";
    }
    body.image_url = frames;
    return this.generateVideo(body, params);
  }

  private videoBody(
    params: TextToVideoParams | ImageToVideoParams
  ): Record<string, unknown> {
    const model = params.model.id || VIDEO_MODEL_ID;
    if (model !== VIDEO_MODEL_ID) {
      throw new Error(`Z.ai video model ${model} is not supported`);
    }
    const body: Record<string, unknown> = { model };
    const prompt = params.prompt?.trim();
    if (prompt) {
      if (prompt.length > VIDEO_PROMPT_MAX_CHARS) {
        throw new Error(
          `Z.ai video prompts are limited to ${VIDEO_PROMPT_MAX_CHARS} characters (got ${prompt.length})`
        );
      }
      body.prompt = prompt;
    }
    if (params.durationSeconds && params.durationSeconds > 0) {
      body.duration = params.durationSeconds > 7.5 ? 10 : 5;
    }
    const size = chooseCogVideoSize(params.aspectRatio, params.resolution);
    if (size) body.size = size;
    return body;
  }

  /** `image_url` items accept a URL or Base64; PNG/JPEG up to 5 MB. */
  private videoImage(bytes: Uint8Array, role: string): string {
    const mime = sniffImageMime(bytes);
    if (!mime || !VIDEO_IMAGE_MIMES.has(mime)) {
      throw new Error(`Z.ai video ${role} must be a PNG or JPEG image`);
    }
    if (bytes.length > VIDEO_IMAGE_MAX_BYTES) {
      throw new Error(`Z.ai video ${role} exceeds the 5 MB image limit`);
    }
    return Buffer.from(bytes).toString("base64");
  }

  private async generateVideo(
    body: Record<string, unknown>,
    params: { signal?: AbortSignal; timeoutSeconds?: number | null }
  ): Promise<Uint8Array> {
    const { signal } = params;
    signal?.throwIfAborted();
    log.debug("Z.ai video submit", { model: body.model });
    const created = await this.postJson("videos/generations", body, signal);
    const taskId = created.id;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("Z.ai videos/generations returned no task id");
    }
    await recordGenerationReceiptAsync({ provider_request_id: taskId });
    if (String(created.task_status ?? "").toUpperCase() === "FAIL") {
      throw new Error(`Z.ai video task ${taskId} failed at submission`);
    }

    const timeoutSeconds =
      params.timeoutSeconds && params.timeoutSeconds > 0
        ? params.timeoutSeconds
        : VIDEO_DEFAULT_TIMEOUT_SECONDS;
    const maxAttempts = Math.max(
      1,
      Math.ceil((timeoutSeconds * 1000) / VIDEO_POLL_INTERVAL_MS)
    );
    const url = `${this._zaiBaseURL}/async-result/${encodeURIComponent(taskId)}`;
    const pollOptions: PollUntilTerminalOptions<Record<string, unknown>> = {
      intervalMs: VIDEO_POLL_INTERVAL_MS,
      maxAttempts,
      statusOf: (b) => String(b.task_status ?? "").toLowerCase(),
      onFailure: (b) =>
        new Error(`Z.ai video task ${taskId} failed: ${JSON.stringify(b).slice(0, 500)}`),
      onTimeout: () =>
        new Error(`Z.ai video task ${taskId} did not finish within ${timeoutSeconds}s`)
    };
    if (signal) pollOptions.signal = signal;
    const result = await pollUntilTerminal<Record<string, unknown>>(
      async () => {
        const init: RequestInit = { headers: this.headers(false) };
        if (signal) init.signal = signal;
        // The task is billed: a 429 or gateway 5xx on the status GET backs off.
        const response = await fetchWithRetry(url, init, {
          fetchImpl: this._zaiFetch
        });
        const payload = await readJson(response);
        if (!response.ok) {
          throw new Error(
            `Z.ai async-result failed: ${zaiErrorMessage(payload, response.status)}`
          );
        }
        return asRecord(payload);
      },
      pollOptions
    );
    const videos = Array.isArray(result.video_result) ? result.video_result : [];
    const videoUrl = asRecord(videos[0]).url;
    if (typeof videoUrl !== "string" || !videoUrl) {
      throw new Error(`Z.ai video task ${taskId} succeeded without a video URL`);
    }
    return this.download(videoUrl, signal);
  }

  // ---------------------------------------------------------------------------
  // ASR: POST /audio/transcriptions (multipart, .wav/.mp3, <= 25 MB, <= 30 s)
  // ---------------------------------------------------------------------------

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    const model = args.model || ASR_MODEL_ID;
    if (model !== ASR_MODEL_ID) {
      throw new Error(`Z.ai ASR model ${model} is not supported`);
    }
    const mime = sniffAudioMimeOrNull(args.audio);
    if (mime !== "audio/wav" && mime !== "audio/mpeg") {
      throw new Error("Z.ai transcription accepts only WAV or MP3 audio");
    }
    if (args.audio.length > ASR_MAX_BYTES) {
      throw new Error("Z.ai transcription accepts files up to 25 MB");
    }
    const form = new FormData();
    const filename = mime === "audio/wav" ? "audio.wav" : "audio.mp3";
    form.append("file", new Blob([new Uint8Array(args.audio)], { type: mime }), filename);
    form.append("model", model);
    if (args.prompt) form.append("prompt", args.prompt);
    form.append("stream", "false");

    const response = await this._zaiFetch(
      `${this._zaiBaseURL}/audio/transcriptions`,
      { method: "POST", headers: this.headers(false), body: form }
    );
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(
        `Z.ai audio/transcriptions failed: ${zaiErrorMessage(payload, response.status)}`
      );
    }
    const text = asRecord(payload).text;
    if (typeof text !== "string") {
      throw new Error("Z.ai audio/transcriptions returned no text");
    }
    return { text };
  }
}
