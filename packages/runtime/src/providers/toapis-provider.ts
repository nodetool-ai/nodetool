import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { z } from "zod";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { fetchWithRetry, sleep } from "./http-transport.js";
import { sniffImageMime } from "./image-mime.js";
import { safeFetch } from "./safe-url.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  Message,
  ProviderStreamItem,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const BASE_URL = "https://toapis.com/v1";

const GPT_IMAGE_2_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"];
const GPT_IMAGE_25_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"];
const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"];

interface ImageSpec {
  id: string;
  name: string;
  aspectRatios: string[];
  /** Values the model accepts for `quality`; the field is not sent otherwise. */
  qualities?: readonly string[];
  maxReferences: number;
}

const IMAGE_MODELS: readonly ImageSpec[] = [
  { id: "gpt-image-2", name: "GPT Image 2", aspectRatios: GPT_IMAGE_2_RATIOS, maxReferences: 14 },
  {
    id: "gpt-image-2-vip",
    name: "GPT Image 2 VIP",
    aspectRatios: GPT_IMAGE_2_RATIOS,
    qualities: ["low", "medium", "high"],
    maxReferences: 14
  },
  { id: "gpt-image-2.5-flare", name: "GPT Image 2.5 Flare", aspectRatios: GPT_IMAGE_25_RATIOS, maxReferences: 14 },
  { id: "gpt-image-2.5-sunburst", name: "GPT Image 2.5 Sunburst", aspectRatios: GPT_IMAGE_25_RATIOS, maxReferences: 14 }
];

const VIDEO_TASKS = ["text_to_video", "image_to_video", "reference_to_video"];
const VIDEO_DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
const VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const VIDEO_MODELS: readonly VideoModel[] = [
  { id: "seedance-2", name: "Seedance 2", resolutions: ["480p", "720p", "1080p", "4k"] },
  { id: "seedance-2-fast", name: "Seedance 2 Fast", resolutions: ["480p", "720p"] },
  { id: "seedance-2-mini", name: "Seedance 2 Mini", resolutions: ["480p", "720p"] }
].map((model) => ({
  ...model,
  provider: PROVIDER_IDS.TOAPIS,
  supportedTasks: VIDEO_TASKS,
  durations: VIDEO_DURATIONS,
  aspectRatios: VIDEO_RATIOS
}));

const UPLOAD_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_REFERENCES = 9;
const IMAGE_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_INTERVAL_MS = 10000;
const IMAGE_TIMEOUT_SECONDS = 10 * 60;
const VIDEO_TIMEOUT_SECONDS = 30 * 60;
const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled", "expired"]);

const TaskSchema = z.object({
  id: z.string(),
  status: z.string(),
  progress: z.number().nullish(),
  result: z.object({ data: z.array(z.object({ url: z.string() })) }).nullish(),
  error: z.unknown().optional()
});

type Task = z.infer<typeof TaskSchema>;
type TaskKind = "images" | "videos";

const UploadSchema = z.object({ data: z.object({ url: z.string() }) });

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message) return record.message;
    if (record.error !== undefined) return errorMessage(record.error, fallback);
  }
  return fallback;
}

function imageSpec(modelId: string): ImageSpec {
  const spec = IMAGE_MODELS.find((model) => model.id === modelId);
  if (!spec) throw new Error(`Unknown ToAPIs image model: ${modelId}`);
  return spec;
}

function videoModelId(modelId: string): string {
  if (!VIDEO_MODELS.some((model) => model.id === modelId)) {
    throw new Error(`Unknown ToAPIs video model: ${modelId}`);
  }
  return modelId;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** ToAPIs takes an aspect ratio, not pixels. Pixel sizes map to their reduced ratio. */
function aspectRatio(spec: ImageSpec, ratio?: string | null, width?: number | null, height?: number | null): string | undefined {
  if (ratio && spec.aspectRatios.includes(ratio)) return ratio;
  if (width && height && width > 0 && height > 0) {
    const divisor = gcd(width, height);
    const reduced = `${width / divisor}:${height / divisor}`;
    if (spec.aspectRatios.includes(reduced)) return reduced;
  }
  return undefined;
}

/**
 * GPT Image and Seedance 2 generation through ToAPIs (toapis.com), an
 * independent BYOK API. Every generation is an asynchronous task: submit,
 * poll the task, then download the result URL, which expires after 24 hours.
 * Input images are uploaded first, because the image models accept URLs only.
 */
export class ToapisProvider extends BaseProvider {
  private readonly apiKey: string;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "reference_to_video"];
  }

  static override requiredSecrets(): string[] {
    return ["TOAPIS_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.TOAPIS);
    const apiKey = secrets.TOAPIS_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("TOAPIS_API_KEY is required");
    }
    this.apiKey = apiKey.trim();
  }

  override getContainerEnv(): Record<string, string> {
    return { TOAPIS_API_KEY: this.apiKey };
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("ToAPIs does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    throw new Error("ToAPIs does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_MODELS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.TOAPIS,
      supportedTasks: ["text_to_image", "image_to_image"],
      aspectRatios: spec.aspectRatios,
      resolutions: IMAGE_RESOLUTIONS
    }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [...VIDEO_MODELS];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("ToAPIs text-to-image requires a prompt");
    const spec = imageSpec(params.model.id);
    const body = this.imageBody(spec, params, aspectRatio(spec, params.aspectRatio, params.width, params.height));
    return this.generate("images", body, params.signal, IMAGE_TIMEOUT_SECONDS);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("ToAPIs image-to-image requires a prompt");
    const spec = imageSpec(params.model.id);
    const sources = images.filter((image) => image.length > 0);
    if (sources.length === 0) throw new Error("ToAPIs image-to-image requires at least one image");
    if (sources.length > spec.maxReferences) {
      throw new Error(`ToAPIs ${spec.id} accepts at most ${spec.maxReferences} reference images`);
    }
    const ratio = aspectRatio(spec, params.aspectRatio, params.targetWidth, params.targetHeight);
    const body = this.imageBody(spec, params, ratio);
    body.reference_images = await this.uploadAll(sources, "reference image", params.signal);
    return this.generate("images", body, params.signal, IMAGE_TIMEOUT_SECONDS);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("ToAPIs text-to-video requires a prompt");
    return this.generate("videos", this.videoBody(params), params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("ToAPIs image-to-video requires a first frame");
    const body = this.videoBody(params);
    const frames = [{ url: await this.upload(image, "first frame", params.signal), role: "first_frame" }];
    if (params.endImage && params.endImage.length > 0) {
      frames.push({ url: await this.upload(params.endImage, "last frame", params.signal), role: "last_frame" });
    }
    body.image_with_roles = frames;
    return this.generate("videos", body, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  override async referenceToVideo(inputs: ReferenceToVideoInputs, params: ReferenceToVideoParams): Promise<Uint8Array> {
    if (inputs.videos.some((video) => video.length > 0) || inputs.audios?.some((audio) => audio.length > 0)) {
      throw new Error("ToAPIs reference-to-video accepts images only");
    }
    const images = inputs.images.filter((image) => image.length > 0);
    if (images.length === 0) throw new Error("ToAPIs reference-to-video requires at least one reference image");
    if (images.length > MAX_VIDEO_REFERENCES) {
      throw new Error(`ToAPIs accepts at most ${MAX_VIDEO_REFERENCES} reference images`);
    }
    if (!params.prompt?.trim()) throw new Error("ToAPIs reference-to-video requires a prompt");
    const body = this.videoBody(params);
    const urls = await this.uploadAll(images, "reference image", params.signal);
    body.image_with_roles = urls.map((url) => ({ url, role: "reference_image" }));
    return this.generate("videos", body, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  private imageBody(
    spec: ImageSpec,
    params: TextToImageParams | ImageToImageParams,
    ratio: string | undefined
  ): Record<string, unknown> {
    const prompt = params.negativePrompt?.trim()
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;
    const body: Record<string, unknown> = { model: spec.id, prompt, n: 1 };
    if (ratio) body.size = ratio;
    const resolution = params.resolution?.toLowerCase();
    if (resolution && ["1k", "2k", "4k"].includes(resolution)) body.resolution = resolution;
    const quality = params.quality?.toLowerCase();
    if (quality && spec.qualities?.includes(quality)) body.quality = quality;
    return body;
  }

  private videoBody(params: TextToVideoParams | ImageToVideoParams): Record<string, unknown> {
    const model = VIDEO_MODELS.find((candidate) => candidate.id === videoModelId(params.model.id));
    const body: Record<string, unknown> = { model: params.model.id, prompt: params.prompt ?? "" };
    if (params.durationSeconds && params.durationSeconds > 0) {
      body.duration = Math.min(15, Math.max(4, Math.round(params.durationSeconds)));
    }
    if (params.resolution && model?.resolutions?.includes(params.resolution)) body.resolution = params.resolution;
    if (params.aspectRatio && VIDEO_RATIOS.includes(params.aspectRatio)) body.aspect_ratio = params.aspectRatio;
    if (typeof params.seed === "number" && params.seed >= 0) body.seed = params.seed;
    return body;
  }

  private headers(json = false): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  private async uploadAll(images: Uint8Array[], role: string, signal?: AbortSignal): Promise<string[]> {
    const urls: string[] = [];
    // Sequential, so the order of `reference_images` matches the inputs.
    for (const [index, image] of images.entries()) {
      urls.push(await this.upload(image, images.length > 1 ? `${role} ${index + 1}` : role, signal));
    }
    return urls;
  }

  private async upload(bytes: Uint8Array, role: string, signal?: AbortSignal): Promise<string> {
    const mime = sniffImageMime(bytes);
    if (!mime || !UPLOAD_MIMES.has(mime)) {
      throw new Error(`ToAPIs ${role} must be a JPEG, PNG, WebP, or GIF image`);
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new Error(`ToAPIs ${role} exceeds the 10 MB upload limit`);
    }
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `image.${mime.split("/")[1]}`);
    const response = await fetch(`${BASE_URL}/uploads/images`, {
      method: "POST",
      headers: this.headers(),
      body: form,
      signal
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`ToAPIs ${role} upload failed: ${errorMessage(payload, `HTTP ${response.status}`)}`);
    }
    const parsed = UploadSchema.safeParse(payload);
    if (!parsed.success) throw new Error(`ToAPIs ${role} upload returned no URL`);
    return parsed.data.data.url;
  }

  private async parse(response: Response, action: string): Promise<Task> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`ToAPIs ${action} failed: ${errorMessage(payload, `HTTP ${response.status}`)}`);
    }
    const parsed = TaskSchema.safeParse(payload);
    if (!parsed.success) throw new Error(`ToAPIs ${action} returned an invalid task`);
    return parsed.data;
  }

  private async generate(
    kind: TaskKind,
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    timeoutSeconds: number
  ): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const noun = kind === "images" ? "image" : "video";
    // Creation is billed and ToAPIs documents no idempotency key, so it is never retried.
    const created = await this.parse(
      await fetch(`${BASE_URL}/${kind}/generations`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify(body),
        signal
      }),
      `${noun} creation`
    );
    await recordGenerationReceiptAsync({ provider_request_id: created.id });

    const task = await this.waitForTask(kind, created, signal, timeoutSeconds);
    if (task.status !== "completed") {
      throw new Error(`ToAPIs ${noun} task ${task.id} ${task.status}: ${errorMessage(task.error, "no reason given")}`);
    }
    const url = task.result?.data[0]?.url;
    if (!url) throw new Error(`ToAPIs ${noun} task ${task.id} completed without a result URL`);
    return this.download(url, signal);
  }

  /**
   * ToAPIs has no cancel endpoint, so a stopped or timed-out run leaves the
   * task to finish upstream; the caller only stops waiting for it.
   */
  private async waitForTask(
    kind: TaskKind,
    created: Task,
    signal: AbortSignal | undefined,
    timeoutSeconds: number
  ): Promise<Task> {
    const noun = kind === "images" ? "image" : "video";
    const path = `${BASE_URL}/${kind}/generations/${encodeURIComponent(created.id)}`;
    const interval = kind === "images" ? IMAGE_POLL_INTERVAL_MS : VIDEO_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeoutSeconds * 1000;
    let current = created;
    while (!TERMINAL.has(current.status)) {
      if (Date.now() >= deadline) {
        throw new Error(`ToAPIs ${noun} task ${created.id} timed out while ${current.status}`);
      }
      await sleep(interval, signal);
      signal?.throwIfAborted();
      current = await this.parse(
        await fetchWithRetry(path, { headers: this.headers(), signal }),
        `${noun} status`
      );
    }
    return current;
  }

  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    // The result is already billed, so transient CDN failures are retried.
    const response = await fetchWithRetry(url, { signal }, {
      fetchImpl: async (input, init) => {
        const response = await safeFetch(String(input), init);
        if (!response.ok) {
          return response;
        }
        // Read inside the retry boundary so a broken response stream retries
        // the protected CDN request, without creating another generation.
        return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
      }
    });
    if (!response.ok) throw new Error(`ToAPIs result download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
