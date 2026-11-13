import { isNonEmptyString, isRecord } from "@nodetool-ai/protocol";
import { z } from "zod";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import type { ProviderCapability } from "./base-provider.js";
import { fetchWithRetry, sleep } from "./http-transport.js";
import { sniffImageMime } from "./image-mime.js";
import {
  OpenAICompatProvider,
  type CompatModelRow,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { trimTrailingSlashes } from "./openai-compat/index.js";
import { safeFetch } from "./safe-url.js";
import {
  PROVIDER_IDS,
  type ImageModel,
  type ImageToImageParams,
  type ImageToVideoParams,
  type LanguageModel,
  type TextToImageParams,
  type TextToVideoParams,
  type VideoModel
} from "./types.js";

/**
 * Asia-Pacific (Johor) endpoint, the default region. Ark keys are
 * region-scoped, so a key from another region needs `BYTEPLUS_ARK_BASE_URL`.
 * https://docs.byteplus.com/docs/en/modelark/image-generation-api.md
 */
export const BYTEPLUS_DEFAULT_BASE_URL =
  "https://ark.ap-southeast.bytepluses.com/api/v3";

/**
 * Resolve the Ark base URL. Precedence: the stored `BYTEPLUS_ARK_BASE_URL`
 * setting > the env var of the same name > the Asia-Pacific default. Shared
 * with `credential-check.ts` so the key probe hits the provider's region.
 */
export function resolveBytePlusBaseURL(override?: string): string {
  const raw =
    override ||
    process.env["BYTEPLUS_ARK_BASE_URL"] ||
    BYTEPLUS_DEFAULT_BASE_URL;
  return trimTrailingSlashes(raw);
}

/**
 * Seed chat models offered when `GET /models` fails or lists nothing. The
 * listing is the source of truth; these ids come from the TanStack AI
 * BytePlus adapter's model table and cover a region whose key cannot list.
 */
const FALLBACK_CHAT_MODELS = [
  "dola-seed-2-1-turbo-260628",
  "seed-2-0-pro-260328",
  "seed-2-0-lite-260428",
  "seed-2-0-mini-260428",
  "seed-1-8-251228",
  "seed-1-6-250915",
  "seed-1-6-flash-250715"
];

interface SeedreamSpec {
  id: string;
  name: string;
  /** Resolution tiers the `size` field accepts by name. */
  tiers: readonly string[];
  /** Documented total-pixel range for a `WIDTHxHEIGHT` size. */
  minPixels: number;
  maxPixels: number;
  maxReferences: number;
}

/**
 * Seedream models, hand-listed: the Volcengine Ark `GET /models` reference
 * documents only text models' modality values, so the listing cannot be
 * trusted to tell image models apart, and the per-model size rules below are
 * not in it anyway. Limits are from the Image generation API page.
 */
const SEEDREAM_MODELS: readonly SeedreamSpec[] = [
  {
    id: "dola-seedream-5-0-pro-260628",
    name: "Seedream 5.0 Pro",
    tiers: ["1K", "1.5K", "2K"],
    minPixels: 921_600,
    maxPixels: 4_624_220,
    maxReferences: 10
  },
  {
    // The docs pair "5.0 pro / flash" but never name this id; its size rules
    // here copy 5.0 lite, released the same day. Unconfirmed.
    id: "seedream-5-0-260128",
    name: "Seedream 5.0",
    tiers: ["2K", "3K", "4K"],
    minPixels: 3_686_400,
    maxPixels: 16_777_216,
    maxReferences: 14
  },
  {
    id: "seedream-5-0-lite-260128",
    name: "Seedream 5.0 Lite",
    tiers: ["2K", "3K", "4K"],
    minPixels: 3_686_400,
    maxPixels: 16_777_216,
    maxReferences: 14
  },
  {
    id: "seedream-4-5-251128",
    name: "Seedream 4.5",
    tiers: ["2K", "4K"],
    minPixels: 3_686_400,
    maxPixels: 16_777_216,
    maxReferences: 14
  },
  {
    id: "seedream-4-0-250828",
    name: "Seedream 4.0",
    tiers: ["1K", "2K", "4K"],
    minPixels: 921_600,
    maxPixels: 16_777_216,
    maxReferences: 14
  }
];

const IMAGE_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"];
const TIER_EDGE: Record<string, number> = {
  "1K": 1024,
  "1.5K": 1536,
  "2K": 2048,
  "3K": 3072,
  "4K": 4096
};

interface SeedanceSpec {
  id: string;
  name: string;
  resolutions: string[];
  minDuration: number;
  maxDuration: number;
  endFrame: "optional" | "none";
  /** 1.5 pro and 1.0 are the only models the create-task page lists `seed` for. */
  seed: boolean;
  /** Seedance 1.0 refuses `adaptive` for text-to-video. */
  adaptiveTextToVideo: boolean;
}

/**
 * Seedance models, hand-listed for the reasons given on {@link SEEDREAM_MODELS}.
 * Resolutions, durations and frame modes are from the Create video generation
 * task API page.
 */
const SEEDANCE_MODELS: readonly SeedanceSpec[] = [
  { id: "dreamina-seedance-2-5-260628", name: "Seedance 2.5", resolutions: ["480p", "720p", "1080p"], minDuration: 4, maxDuration: 30, endFrame: "optional", seed: false, adaptiveTextToVideo: true },
  { id: "dreamina-seedance-2-0-260128", name: "Seedance 2.0", resolutions: ["480p", "720p", "1080p", "4k"], minDuration: 4, maxDuration: 15, endFrame: "optional", seed: false, adaptiveTextToVideo: true },
  { id: "dreamina-seedance-2-0-fast-260128", name: "Seedance 2.0 Fast", resolutions: ["480p", "720p"], minDuration: 4, maxDuration: 15, endFrame: "optional", seed: false, adaptiveTextToVideo: true },
  { id: "dreamina-seedance-2-0-mini-260615", name: "Seedance 2.0 Mini", resolutions: ["480p", "720p"], minDuration: 4, maxDuration: 15, endFrame: "optional", seed: false, adaptiveTextToVideo: true },
  { id: "seedance-1-5-pro-251215", name: "Seedance 1.5 Pro", resolutions: ["480p", "720p", "1080p"], minDuration: 4, maxDuration: 12, endFrame: "optional", seed: true, adaptiveTextToVideo: true },
  { id: "seedance-1-0-pro-250528", name: "Seedance 1.0 Pro", resolutions: ["480p", "720p", "1080p"], minDuration: 2, maxDuration: 12, endFrame: "optional", seed: true, adaptiveTextToVideo: false },
  { id: "seedance-1-0-pro-fast-251015", name: "Seedance 1.0 Pro Fast", resolutions: ["480p", "720p", "1080p"], minDuration: 2, maxDuration: 12, endFrame: "none", seed: true, adaptiveTextToVideo: false }
];

const VIDEO_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"];
const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_TIMEOUT_SECONDS = 30 * 60;
/** Task statuses from the create-task callback section; `cancelled` is Volcengine Ark's. */
const TERMINAL = new Set(["succeeded", "failed", "expired", "cancelled"]);
/** Formats the create-task page accepts for a frame image. */
const FRAME_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif"]);
const MAX_FRAME_BYTES = 30 * 1024 * 1024;

const ErrorSchema = z.object({ code: z.string().nullish(), message: z.string().nullish() });

const ImageResponseSchema = z.object({
  data: z
    .array(z.object({ b64_json: z.string().nullish(), url: z.string().nullish(), error: ErrorSchema.nullish() }))
    .nullish(),
  error: ErrorSchema.nullish()
});

const TaskSchema = z.object({
  id: z.string(),
  status: z.string(),
  content: z.object({ video_url: z.string().nullish() }).nullish(),
  error: ErrorSchema.nullish()
});

type Task = z.infer<typeof TaskSchema>;

function apiError(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const error = isRecord(payload.error) ? payload.error : payload;
    const code = isNonEmptyString(error.code) ? error.code : undefined;
    const message = isNonEmptyString(error.message) ? error.message : undefined;
    if (code && message) return `${code}: ${message}`;
    if (message || code) return (message ?? code) as string;
  }
  return fallback;
}

function seedreamSpec(modelId: string): SeedreamSpec {
  const spec = SEEDREAM_MODELS.find((model) => model.id === modelId);
  if (!spec) throw new Error(`Unknown BytePlus image model: ${modelId}`);
  return spec;
}

function seedanceSpec(modelId: string): SeedanceSpec {
  const spec = SEEDANCE_MODELS.find((model) => model.id === modelId);
  if (!spec) throw new Error(`Unknown BytePlus video model: ${modelId}`);
  return spec;
}

function parseRatio(ratio: string): number | null {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match) return null;
  const value = Number(match[1]) / Number(match[2]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Seedream takes `size` as a named tier ("2K") or `WIDTHxHEIGHT` pixels. An
 * explicit width and height pass through; an aspect ratio becomes pixels at
 * the requested tier (2K by default), clamped into the model's documented
 * pixel range; a tier alone is sent by name. Nothing set leaves the default.
 */
function seedreamSize(
  spec: SeedreamSpec,
  options: { width?: number | null; height?: number | null; aspectRatio?: string | null; resolution?: string | null }
): string | undefined {
  const { width, height } = options;
  if (width && height && width > 0 && height > 0) return `${Math.round(width)}x${Math.round(height)}`;
  const tier = spec.tiers.find((candidate) => candidate.toLowerCase() === options.resolution?.toLowerCase());
  const ratio = options.aspectRatio ? parseRatio(options.aspectRatio) : null;
  if (!ratio) return tier;
  const edge = TIER_EDGE[tier ?? (spec.tiers.includes("2K") ? "2K" : spec.tiers[0])];
  const area = Math.min(spec.maxPixels, Math.max(spec.minPixels, edge * edge));
  let w = Math.round(Math.sqrt(area * ratio) / 16) * 16;
  let h = Math.round(Math.sqrt(area / ratio) / 16) * 16;
  while (w * h < spec.minPixels) {
    w += 16;
    h = Math.round(w / ratio / 16) * 16;
  }
  while (w * h > spec.maxPixels) {
    w -= 16;
    h = Math.round(w / ratio / 16) * 16;
  }
  return `${w}x${h}`;
}

function dataUri(bytes: Uint8Array, role: string): string {
  const mime = sniffImageMime(bytes);
  if (!mime || !FRAME_MIMES.has(mime)) {
    throw new Error(`BytePlus ${role} must be a JPEG, PNG, WebP, BMP, TIFF, or GIF image`);
  }
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new Error(`BytePlus ${role} exceeds the 30 MB image limit`);
  }
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function promptWithNegative(prompt: string, negative?: string | null): string {
  return negative?.trim() ? `${prompt.trim()}\n\nDo not include: ${negative.trim()}` : prompt;
}

/**
 * ByteDance BytePlus ModelArk ("Ark"). One region-scoped API key covers:
 *
 * - Seed chat models over the OpenAI-compatible `/chat/completions`, listed
 *   from `GET /models`;
 * - Seedream images over `POST /images/generations`;
 * - Seedance video as an async task: `POST /contents/generations/tasks`,
 *   then `GET /contents/generations/tasks/{id}` until it settles, then a
 *   download of `content.video_url`, which expires after 24 hours.
 *
 * Seed speech and ASR need a separate voice key and are not wired here.
 */
export class BytePlusProvider extends OpenAICompatProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image", "text_to_video", "image_to_video"];
  }

  static override requiredSecrets(): string[] {
    return ["BYTEPLUS_ARK_API_KEY"];
  }

  constructor(
    secrets: { BYTEPLUS_ARK_API_KEY?: string; BYTEPLUS_ARK_BASE_URL?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.BYTEPLUS_ARK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("BYTEPLUS_ARK_API_KEY is required");
    }
    const baseURL = resolveBytePlusBaseURL(secrets.BYTEPLUS_ARK_BASE_URL);
    super({ providerId: PROVIDER_IDS.BYTEPLUS, apiKey, baseURL }, options);
  }

  override getContainerEnv(): Record<string, string> {
    const env: Record<string, string> = { BYTEPLUS_ARK_API_KEY: this.apiKey };
    if (this.compatBaseURL !== BYTEPLUS_DEFAULT_BASE_URL) {
      env["BYTEPLUS_ARK_BASE_URL"] = this.compatBaseURL;
    }
    return env;
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /**
   * Text-output models from `GET /models`. A row says what it emits in
   * `modalities.output_modalities`; a row without modalities counts when its
   * `task_type` includes `TextGeneration`.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const rows = await this.fetchCompatModelRows();
    const chat = rows.filter(isTextModel);
    const ids = chat.length > 0 ? chat.map((row) => row.id) : FALLBACK_CHAT_MODELS;
    return ids.map((id) => ({ id, name: id, provider: PROVIDER_IDS.BYTEPLUS }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return SEEDREAM_MODELS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.BYTEPLUS,
      supportedTasks: ["text_to_image", "image_to_image"],
      aspectRatios: IMAGE_RATIOS,
      resolutions: [...spec.tiers]
    }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return SEEDANCE_MODELS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.BYTEPLUS,
      supportedTasks: ["text_to_video", "image_to_video"],
      resolutions: spec.resolutions,
      durations: Array.from({ length: spec.maxDuration - spec.minDuration + 1 }, (_, i) => spec.minDuration + i),
      aspectRatios: VIDEO_RATIOS,
      endFrame: spec.endFrame
    }));
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("BytePlus text-to-image requires a prompt");
    const spec = seedreamSpec(params.model.id);
    const body = this.imageBody(spec, params.prompt, params.negativePrompt, seedreamSize(spec, params));
    return this.generateImage(body, params.signal);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("BytePlus image-to-image requires a prompt");
    const spec = seedreamSpec(params.model.id);
    const sources = images.filter((image) => image.length > 0);
    if (sources.length === 0) throw new Error("BytePlus image-to-image requires at least one image");
    if (sources.length > spec.maxReferences) {
      throw new Error(`BytePlus ${spec.name} accepts at most ${spec.maxReferences} reference images`);
    }
    const size = seedreamSize(spec, {
      width: params.targetWidth,
      height: params.targetHeight,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution
    });
    const body = this.imageBody(spec, params.prompt, params.negativePrompt, size);
    const uris = sources.map((image, i) => dataUri(image, sources.length > 1 ? `reference image ${i + 1}` : "reference image"));
    body.image = uris.length === 1 ? uris[0] : uris;
    return this.generateImage(body, params.signal);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("BytePlus text-to-video requires a prompt");
    const spec = seedanceSpec(params.model.id);
    const body = this.videoBody(spec, params, [], false);
    return this.generateVideo(body, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("BytePlus image-to-video requires a first frame");
    const spec = seedanceSpec(params.model.id);
    const frames: Record<string, unknown>[] = [
      { type: "image_url", image_url: { url: dataUri(image, "first frame") }, role: "first_frame" }
    ];
    if (params.endImage && params.endImage.length > 0) {
      if (spec.endFrame === "none") throw new Error(`BytePlus ${spec.name} does not take a last frame`);
      frames.push({ type: "image_url", image_url: { url: dataUri(params.endImage, "last frame") }, role: "last_frame" });
    }
    const body = this.videoBody(spec, params, frames, true);
    return this.generateVideo(body, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  private imageBody(
    spec: SeedreamSpec,
    prompt: string,
    negativePrompt: string | null | undefined,
    size: string | undefined
  ): Record<string, unknown> {
    // `watermark` defaults to true on Ark; NodeTool output is unmarked.
    const body: Record<string, unknown> = {
      model: spec.id,
      prompt: promptWithNegative(prompt, negativePrompt),
      response_format: "b64_json",
      watermark: false
    };
    if (size) body.size = size;
    return body;
  }

  private videoBody(
    spec: SeedanceSpec,
    params: TextToVideoParams | ImageToVideoParams,
    frames: Record<string, unknown>[],
    hasImage: boolean
  ): Record<string, unknown> {
    const content: Record<string, unknown>[] = [];
    const prompt = params.prompt?.trim();
    if (prompt) content.push({ type: "text", text: promptWithNegative(prompt, params.negativePrompt) });
    content.push(...frames);
    const body: Record<string, unknown> = { model: spec.id, content, watermark: false };
    if (params.resolution && spec.resolutions.includes(params.resolution)) body.resolution = params.resolution;
    const ratio = params.aspectRatio;
    if (ratio && VIDEO_RATIOS.includes(ratio) && (ratio !== "adaptive" || hasImage || spec.adaptiveTextToVideo)) {
      body.ratio = ratio;
    }
    if (params.durationSeconds && params.durationSeconds > 0) {
      body.duration = Math.min(spec.maxDuration, Math.max(spec.minDuration, Math.round(params.durationSeconds)));
    }
    if (spec.seed && typeof params.seed === "number" && params.seed >= 0) body.seed = params.seed;
    return body;
  }

  private headers(json = false): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  private async generateImage(body: Record<string, unknown>, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    // Generation is billed and Ark documents no idempotency key, so no retry.
    const response = await this.compatFetch(`${this.compatBaseURL}/images/generations`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
      signal
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`BytePlus image generation failed: ${apiError(payload, `HTTP ${response.status}`)}`);
    }
    const parsed = ImageResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("BytePlus image generation returned an invalid response");
    if (parsed.data.error) {
      throw new Error(`BytePlus image generation failed: ${apiError(parsed.data, "no reason given")}`);
    }
    const first = parsed.data.data?.[0];
    if (first?.b64_json) return new Uint8Array(Buffer.from(first.b64_json, "base64"));
    if (first?.error) {
      throw new Error(`BytePlus image generation failed: ${apiError({ error: first.error }, "no reason given")}`);
    }
    throw new Error("BytePlus image generation returned no image");
  }

  private async parseTask(response: Response, action: string): Promise<Task> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`BytePlus ${action} failed: ${apiError(payload, `HTTP ${response.status}`)}`);
    }
    const parsed = TaskSchema.safeParse(payload);
    if (!parsed.success) throw new Error(`BytePlus ${action} returned an invalid task`);
    return parsed.data;
  }

  private async generateVideo(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    timeoutSeconds: number
  ): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const response = await this.compatFetch(`${this.compatBaseURL}/contents/generations/tasks`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
      signal
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`BytePlus video task creation failed: ${apiError(payload, `HTTP ${response.status}`)}`);
    }
    const id = isRecord(payload) && isNonEmptyString(payload.id) ? payload.id : undefined;
    if (!id) throw new Error("BytePlus video task creation returned no task id");
    await recordGenerationReceiptAsync({ provider_request_id: id });

    const task = await this.waitForTask(id, signal, timeoutSeconds);
    if (task.status !== "succeeded") {
      throw new Error(`BytePlus video task ${id} ${task.status}: ${apiError({ error: task.error }, "no reason given")}`);
    }
    const url = task.content?.video_url;
    if (!url) throw new Error(`BytePlus video task ${id} succeeded without a video_url`);
    return this.download(url, signal);
  }

  /**
   * Polls until the task settles. A stopped or timed-out run only stops
   * waiting: Ark's cancel endpoint works on queued tasks only, so a running
   * task finishes upstream either way.
   */
  private async waitForTask(id: string, signal: AbortSignal | undefined, timeoutSeconds: number): Promise<Task> {
    const url = `${this.compatBaseURL}/contents/generations/tasks/${encodeURIComponent(id)}`;
    const deadline = Date.now() + timeoutSeconds * 1000;
    let status = "queued";
    const timeoutError = () => new Error(`BytePlus video task ${id} timed out while ${status}`);
    const timeout = new AbortController();
    const pollSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(timeoutError()), Math.max(0, deadline - Date.now()));
    const checkDeadline = () => {
      pollSignal.throwIfAborted();
      if (Date.now() >= deadline) throw timeoutError();
    };
    try {
      for (;;) {
        checkDeadline();
        await sleep(Math.min(VIDEO_POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())), pollSignal);
        checkDeadline();
        const task = await this.parseTask(
          await fetchWithRetry(url, { headers: this.headers(), signal: pollSignal }, { fetchImpl: this.compatFetch }),
          "video task status"
        );
        status = task.status;
        if (TERMINAL.has(status)) return task;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    // The video is already billed, so transient CDN failures are retried.
    const response = await fetchWithRetry(url, { signal }, {
      fetchImpl: async (input, init) => {
        const res = await safeFetch(String(input), init);
        if (!res.ok) return res;
        return new Response(await res.arrayBuffer(), { status: res.status, headers: res.headers });
      }
    });
    if (!response.ok) throw new Error(`BytePlus video download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

function isTextModel(row: CompatModelRow): boolean {
  const modalities = isRecord(row.modalities) ? row.modalities : undefined;
  const output = modalities?.output_modalities;
  if (Array.isArray(output)) return output.includes("text");
  return Array.isArray(row.task_type) && row.task_type.includes("TextGeneration");
}
