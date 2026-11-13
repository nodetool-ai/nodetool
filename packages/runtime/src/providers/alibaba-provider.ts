import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { trimTrailingSlashes } from "./openai-compat/index.js";
import type { ChatCompletionsRequest } from "./openai-compat/types.js";
import {
  PROVIDER_IDS,
  type EncodedAudioResult,
  type ImageModel,
  type ImageToImageParams,
  type ImageToVideoParams,
  type LanguageModel,
  type StreamingAudioChunk,
  type TextToImageParams,
  type TextToSpeechParams,
  type TextToVideoParams,
  type TTSModel,
  type VideoModel
} from "./types.js";
import type { ProviderCapability } from "./base-provider.js";
import { safeFetch } from "./safe-url.js";
import { fetchWithRetry, pollUntilTerminal } from "./http-transport.js";
import { parseWavPCM } from "./wav-pcm.js";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import {
  MULTIMODAL_GENERATION_PATH,
  QWEN_TTS_SAMPLE_RATE,
  VIDEO_SYNTHESIS_PATH,
  alibabaImageModels,
  imageGenerationBody,
  imageToVideoBody,
  imageUrlsOf,
  nativeApiBase,
  qwenTTSModels,
  speechBody,
  textToVideoBody,
  wanVideoModels,
  type ImageRequest,
  type WanVideoRequest
} from "./alibaba-media.js";

export const ALIBABA_DEFAULT_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Resolve the DashScope base URL for the key's region. Precedence: explicit
 * override (the stored `DASHSCOPE_BASE_URL` setting) > `DASHSCOPE_BASE_URL`
 * env var > the international (Singapore) default. Shared with
 * `credential-check.ts` so key verification probes the same endpoint the
 * provider talks to.
 */
export function resolveAlibabaBaseURL(override?: string): string {
  const raw =
    override || process.env["DASHSCOPE_BASE_URL"] || ALIBABA_DEFAULT_BASE_URL;
  return trimTrailingSlashes(raw);
}

/**
 * Model families served through the OpenAI-compatible endpoint that Alibaba's
 * function-calling documentation excludes — sending `tools` to them answers
 * 400 "The tool call is not supported".
 * See https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling.
 */
const NO_TOOL_SUPPORT_PREFIXES = [
  "qwen-math",
  "qwen2-math",
  "qwen2.5-math",
  "qvq",
  "qwen-vl-ocr",
  "qwen-mt",
  "qwen-audio",
  "qwen2-audio",
  "qwen-tts",
  "text-embedding"
];

/** Wan video tasks take 1-5 minutes; the API reference suggests polling every 15s. */
const VIDEO_POLL_INTERVAL_MS = 15_000;
/** Poll budget when the caller sets no timeout: 30 minutes. */
const VIDEO_DEFAULT_TIMEOUT_S = 30 * 60;

/** Task states. UNKNOWN means the task does not exist or expired (24h). */
const TASK_SUCCESS = new Set(["succeeded"]);
const TASK_FAILURE = new Set(["failed", "canceled", "unknown"]);

interface TaskOutput {
  task_id?: string;
  task_status?: string;
  video_url?: string;
  code?: string;
  message?: string;
}

function taskOutput(body: Record<string, unknown>): TaskOutput {
  const output = body.output;
  return output && typeof output === "object" ? (output as TaskOutput) : {};
}

/** `Alibaba <context> failed (<status>): <code>: <message>` from a DashScope error reply. */
async function dashscopeError(res: Response, context: string): Promise<Error> {
  const text = await res.text();
  let detail = text;
  try {
    const body = JSON.parse(text) as { code?: unknown; message?: unknown };
    if (typeof body.code === "string" || typeof body.message === "string") {
      detail = [body.code, body.message].filter(Boolean).join(": ");
    }
  } catch {
    // Not JSON: report the raw text.
  }
  return new Error(`Alibaba ${context} failed (${res.status}): ${detail}`);
}

/**
 * Alibaba Cloud Model Studio provider. Speaks the OpenAI Chat Completions
 * dialect against DashScope's OpenAI-compatible endpoint, which serves the
 * Qwen model family behind a single API key. Wan video, Wan and Qwen-Image
 * images, and Qwen TTS go through DashScope's native API (`/api/v1`) on the
 * same regional host; see `alibaba-media.ts` for the catalog and bodies.
 *
 * Model Studio keys are region-scoped: the default base URL is the
 * international (Singapore) endpoint, and a key created in another region
 * (Beijing, Frankfurt, Virginia, Tokyo, Hong Kong) needs `DASHSCOPE_BASE_URL`
 * pointed at that region's `/compatible-mode/v1` endpoint.
 * See https://modelstudio.console.alibabacloud.com/.
 */
export class AlibabaProvider extends OpenAICompatProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "text_to_speech"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["DASHSCOPE_API_KEY"];
  }

  constructor(
    secrets: { DASHSCOPE_API_KEY?: string; DASHSCOPE_BASE_URL?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is required");
    }

    // Precedence mirrors LMStudioProvider: resolved settings (secret store,
    // then env) arrive as `secrets`, so honoring `secrets.DASHSCOPE_BASE_URL`
    // is what lets users point the provider at their key's region.
    const baseURL = resolveAlibabaBaseURL(secrets.DASHSCOPE_BASE_URL);

    super({ providerId: PROVIDER_IDS.ALIBABA, apiKey, baseURL }, options);
  }

  override getContainerEnv() {
    const env: Record<string, string> = { DASHSCOPE_API_KEY: this.apiKey };
    if (this.compatBaseURL !== ALIBABA_DEFAULT_BASE_URL) {
      env["DASHSCOPE_BASE_URL"] = this.compatBaseURL;
    }
    return env;
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    const id = model.toLowerCase();
    return !NO_TOOL_SUPPORT_PREFIXES.some((prefix) => id.startsWith(prefix));
  }

  /**
   * DashScope documents `max_completion_tokens` only for the newest Qwen
   * releases; every chat model accepts `max_tokens`, so send that instead.
   */
  protected override transformChatRequest(
    request: ChatCompletionsRequest
  ): ChatCompletionsRequest {
    const { max_completion_tokens, ...rest } = request;
    if (max_completion_tokens === undefined) {
      return request;
    }
    return { ...rest, max_tokens: max_completion_tokens };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }

  // ---------------------------------------------------------------------------
  // Native DashScope API (/api/v1)
  // ---------------------------------------------------------------------------

  private get nativeBase(): string {
    return nativeApiBase(this.compatBaseURL);
  }

  private nativeHeaders(async = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
    if (async) headers["X-DashScope-Async"] = "enable";
    return headers;
  }

  /** POST a native API body. Not retried: each call creates billed work. */
  private async postNative(
    path: string,
    body: Record<string, unknown>,
    options: { async?: boolean; signal?: AbortSignal; context: string }
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method: "POST",
      headers: this.nativeHeaders(options.async),
      body: JSON.stringify(body)
    };
    if (options.signal) init.signal = options.signal;
    const res = await this.compatFetch(`${this.nativeBase}${path}`, init);
    if (!res.ok) throw await dashscopeError(res, options.context);
    return (await res.json()) as Record<string, unknown>;
  }

  /** Download a result URL from a DashScope reply (OSS, valid 24h). */
  private async downloadResult(
    url: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const res = await safeFetch(url, signal ? { signal } : undefined, 5, this.compatFetch);
    if (!res.ok) {
      throw new Error(`Failed to download Alibaba result (${res.status}) from ${url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return alibabaImageModels();
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return wanVideoModels();
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return qwenTTSModels();
  }

  // ---------------------------------------------------------------------------
  // Images: POST multimodal-generation/generation (sync)
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const [first] = await this.textToImages(params, 1);
    return first;
  }

  override async textToImages(
    params: TextToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    return this.generateImages(
      params.model.id,
      {
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        width: params.width,
        height: params.height,
        resolution: params.resolution,
        seed: params.seed,
        n: numImages
      },
      params.signal
    );
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const [first] = await this.imageToImages(images, params, 1);
    return first;
  }

  override async imageToImages(
    images: Uint8Array[],
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    const inputs = images.filter((image) => image.length > 0);
    if (inputs.length === 0) {
      throw new Error("image_to_image requires at least one input image");
    }
    return this.generateImages(
      params.model.id,
      {
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        width: params.targetWidth,
        height: params.targetHeight,
        resolution: params.resolution,
        seed: params.seed,
        n: numImages,
        images: inputs
      },
      params.signal
    );
  }

  private async generateImages(
    modelId: string,
    req: ImageRequest,
    signal?: AbortSignal
  ): Promise<Uint8Array[]> {
    if (!req.prompt?.trim()) throw new Error("The input prompt cannot be empty.");
    const body = imageGenerationBody(modelId, req);
    const reply = await this.postNative(MULTIMODAL_GENERATION_PATH, body, {
      signal,
      context: `${modelId} image generation`
    });
    if (typeof reply.request_id === "string") {
      await recordGenerationReceiptAsync({ provider_request_id: reply.request_id });
    }
    const urls = imageUrlsOf(reply);
    if (urls.length === 0) {
      throw new Error(
        `Alibaba ${modelId} returned no image: ${JSON.stringify(reply).slice(0, 500)}`
      );
    }
    const results: Uint8Array[] = [];
    for (const url of urls) results.push(await this.downloadResult(url, signal));
    return results;
  }

  // ---------------------------------------------------------------------------
  // Video: POST video-synthesis (async), poll GET /tasks/{task_id}
  // ---------------------------------------------------------------------------

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("The input prompt cannot be empty.");
    const body = textToVideoBody(params.model.id, this.videoRequest(params));
    return this.runVideoTask(body, params.timeoutSeconds, params.signal);
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("image_to_video requires an input image");
    const body = imageToVideoBody(params.model.id, {
      ...this.videoRequest(params),
      firstFrame: image,
      lastFrame: params.endImage ?? undefined
    });
    return this.runVideoTask(body, params.timeoutSeconds, params.signal);
  }

  private videoRequest(params: TextToVideoParams | ImageToVideoParams): WanVideoRequest {
    return {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      durationSeconds: params.durationSeconds,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      seed: params.seed
    };
  }

  private async runVideoTask(
    body: Record<string, unknown>,
    timeoutSeconds: number | null | undefined,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const created = await this.postNative(VIDEO_SYNTHESIS_PATH, body, {
      async: true,
      signal,
      context: `${String(body.model)} video task`
    });
    const taskId = taskOutput(created).task_id;
    if (!taskId) {
      throw new Error(
        `Alibaba video task returned no task_id: ${JSON.stringify(created).slice(0, 500)}`
      );
    }
    await recordGenerationReceiptAsync({ provider_request_id: taskId });

    const budget = timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds : VIDEO_DEFAULT_TIMEOUT_S;
    const maxAttempts = Math.max(1, Math.ceil((budget * 1000) / VIDEO_POLL_INTERVAL_MS));
    const url = `${this.nativeBase}/tasks/${encodeURIComponent(taskId)}`;
    const pollOptions: Parameters<typeof pollUntilTerminal<Record<string, unknown>>>[1] = {
      success: TASK_SUCCESS,
      failure: TASK_FAILURE,
      intervalMs: VIDEO_POLL_INTERVAL_MS,
      maxAttempts,
      statusOf: (reply) => String(taskOutput(reply).task_status ?? "").toLowerCase(),
      onFailure: (reply) => {
        const output = taskOutput(reply);
        const detail = [output.code, output.message].filter(Boolean).join(": ");
        return new Error(
          `Alibaba video task ${taskId} ended ${output.task_status}${detail ? `: ${detail}` : ""}`
        );
      },
      onTimeout: () =>
        new Error(`Alibaba video task ${taskId} did not finish within ${budget}s`)
    };
    if (signal) pollOptions.signal = signal;

    const done = await pollUntilTerminal<Record<string, unknown>>(async () => {
      // The task is created and billed: a 429 or 5xx on the status GET backs off.
      const init: RequestInit = { headers: this.nativeHeaders() };
      if (signal) init.signal = signal;
      const res = await fetchWithRetry(url, init, { fetchImpl: this.compatFetch });
      if (!res.ok) throw await dashscopeError(res, `video task ${taskId} status`);
      return (await res.json()) as Record<string, unknown>;
    }, pollOptions);

    const videoUrl = taskOutput(done).video_url;
    if (!videoUrl) {
      throw new Error(`Alibaba video task ${taskId} succeeded but returned no video_url`);
    }
    return this.downloadResult(videoUrl, signal);
  }

  // ---------------------------------------------------------------------------
  // Speech: POST multimodal-generation/generation with a Qwen TTS model (sync)
  // ---------------------------------------------------------------------------

  /** Qwen TTS returns WAV only, so every request answers WAV whatever `audioFormat` asks. */
  override async textToSpeechEncoded(
    args: TextToSpeechParams
  ): Promise<EncodedAudioResult | null> {
    return { data: await this.synthesize(args), mimeType: "audio/wav" };
  }

  override async *textToSpeech(
    args: TextToSpeechParams
  ): AsyncGenerator<StreamingAudioChunk> {
    const { samples, sampleRate } = parseWavPCM(
      await this.synthesize(args),
      QWEN_TTS_SAMPLE_RATE
    );
    yield { samples, sampleRate };
  }

  private async synthesize(args: TextToSpeechParams): Promise<Uint8Array> {
    if (!args.text?.trim()) throw new Error("text must not be empty");
    const body = speechBody(args);
    const reply = await this.postNative(MULTIMODAL_GENERATION_PATH, body, {
      signal: args.signal,
      context: `${String(body.model)} speech synthesis`
    });
    if (typeof reply.request_id === "string") {
      await recordGenerationReceiptAsync({ provider_request_id: reply.request_id });
    }
    const audio = (reply.output as { audio?: { url?: unknown; data?: unknown } } | undefined)
      ?.audio;
    if (typeof audio?.data === "string" && audio.data) {
      return new Uint8Array(Buffer.from(audio.data, "base64"));
    }
    if (typeof audio?.url === "string" && audio.url) {
      return this.downloadResult(audio.url, args.signal);
    }
    throw new Error(
      `Alibaba speech synthesis returned no audio: ${JSON.stringify(reply).slice(0, 500)}`
    );
  }
}
