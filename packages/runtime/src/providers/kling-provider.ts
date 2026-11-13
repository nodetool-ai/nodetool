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
  TextToImageParams,
  TextToVideoParams,
  VideoEndFrame,
  VideoModel
} from "./types.js";

// Global endpoint for servers outside mainland China.
// https://kling.ai/document-api/api/get-started/authentication.md
const BASE_URL = "https://api-singapore.klingai.com";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

interface VideoSpec {
  id: string;
  name: string;
  /** Omni models take text and frames on one `/omni-video/<id>` endpoint. */
  omni: boolean;
  resolutions: string[];
  durations: number[];
  aspectRatios: string[];
  endFrame: VideoEndFrame;
  maxImageBytes: number;
}

const MB = 1024 * 1024;
const RATIOS_3 = ["16:9", "9:16", "1:1"];
const RATIOS_4 = ["21:9", "16:9", "9:16", "1:1"];

// Kling has no model listing endpoint, so the models are listed by hand from
// the per-model pages at https://kling.ai/document-api/llms.txt.
const VIDEO_SPECS: readonly VideoSpec[] = [
  { id: "kling-4.0", name: "Kling 4.0", omni: false, resolutions: ["720p", "1080p"], durations: range(3, 30), aspectRatios: RATIOS_4, endFrame: "optional", maxImageBytes: 30 * MB },
  { id: "kling-4.0-flash", name: "Kling 4.0 Flash", omni: false, resolutions: ["720p"], durations: range(3, 20), aspectRatios: RATIOS_4, endFrame: "none", maxImageBytes: 30 * MB },
  { id: "kling-3.0-turbo", name: "Kling 3.0 Turbo", omni: false, resolutions: ["720p", "1080p"], durations: range(3, 15), aspectRatios: RATIOS_3, endFrame: "none", maxImageBytes: 50 * MB },
  { id: "kling-3.0", name: "Kling 3.0", omni: false, resolutions: ["720p", "1080p", "4k"], durations: range(3, 15), aspectRatios: RATIOS_3, endFrame: "optional", maxImageBytes: 50 * MB },
  { id: "kling-3.0-omni", name: "Kling 3.0 Omni", omni: true, resolutions: ["720p", "1080p", "4k"], durations: range(3, 15), aspectRatios: RATIOS_3, endFrame: "optional", maxImageBytes: 50 * MB },
  { id: "kling-o1", name: "Kling O1", omni: true, resolutions: ["720p", "1080p"], durations: range(3, 10), aspectRatios: RATIOS_3, endFrame: "optional", maxImageBytes: 50 * MB },
  { id: "kling-2.6", name: "Kling 2.6", omni: false, resolutions: ["720p", "1080p"], durations: [5, 10], aspectRatios: RATIOS_3, endFrame: "optional", maxImageBytes: 50 * MB }
];

const VIDEO_MODELS: readonly VideoModel[] = VIDEO_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  provider: PROVIDER_IDS.KLING,
  supportedTasks: ["text_to_video", "image_to_video"],
  durations: spec.durations,
  resolutions: spec.resolutions,
  aspectRatios: spec.aspectRatios,
  endFrame: spec.endFrame
}));

interface ImageSpec {
  id: string;
  name: string;
  path: "/v1/images/generations" | "/v1/images/omni-image";
  resolutions: string[];
  aspectRatios: string[];
  /** Omni image models take up to 10 references; Image 3.0 takes one. */
  maxReferences: number;
}

const IMAGE_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"];

// Hand-listed for the same reason as the video models.
const IMAGE_SPECS: readonly ImageSpec[] = [
  { id: "kling-v3", name: "Kling Image 3.0", path: "/v1/images/generations", resolutions: ["1k", "2k"], aspectRatios: IMAGE_RATIOS, maxReferences: 1 },
  { id: "kling-v3-omni", name: "Kling Image 3.0 Omni", path: "/v1/images/omni-image", resolutions: ["1k", "2k", "4k"], aspectRatios: IMAGE_RATIOS, maxReferences: 10 },
  { id: "kling-image-o1", name: "Kling Image O1", path: "/v1/images/omni-image", resolutions: ["1k", "2k"], aspectRatios: IMAGE_RATIOS, maxReferences: 10 }
];

const INPUT_MIMES = new Set(["image/jpeg", "image/png"]);
const MAX_REFERENCE_IMAGE_BYTES = 10 * MB;
const IMAGE_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_INTERVAL_MS = 10000;
const IMAGE_TIMEOUT_SECONDS = 10 * 60;
const VIDEO_TIMEOUT_SECONDS = 30 * 60;

// Every response wraps its payload as { code, message, request_id, data }; code 0 is success.
// https://kling.ai/document-api/api/get-started/error-codes.md
const EnvelopeSchema = z.object({
  code: z.number(),
  message: z.string().nullish(),
  request_id: z.string().nullish(),
  data: z.unknown().optional()
});

// Video endpoints follow the newer design: model in the path, tasks polled through GET /tasks.
const VideoTaskSchema = z.object({
  id: z.string(),
  status: z.string(),
  message: z.string().nullish(),
  outputs: z.array(z.object({ type: z.string(), url: z.string().nullish() })).nullish()
});
type VideoTask = z.infer<typeof VideoTaskSchema>;
const VIDEO_TERMINAL = new Set(["succeeded", "failed"]);

// Image endpoints follow the legacy design: model_name in the body, polled by task id.
const ImageTaskSchema = z.object({
  task_id: z.string(),
  task_status: z.string(),
  task_status_msg: z.string().nullish(),
  task_result: z
    .object({
      images: z.array(z.object({ url: z.string() })).nullish(),
      series_images: z.array(z.object({ url: z.string() })).nullish()
    })
    .nullish()
});
type ImageTask = z.infer<typeof ImageTaskSchema>;
const IMAGE_TERMINAL = new Set(["succeed", "failed"]);

function videoSpec(modelId: string): VideoSpec {
  const spec = VIDEO_SPECS.find((candidate) => candidate.id === modelId);
  if (!spec) throw new Error(`Unknown Kling video model: ${modelId}`);
  return spec;
}

function imageSpec(modelId: string): ImageSpec {
  const spec = IMAGE_SPECS.find((candidate) => candidate.id === modelId);
  if (!spec) throw new Error(`Unknown Kling image model: ${modelId}`);
  return spec;
}

function withNegative(prompt: string, negative?: string | null): string {
  return negative?.trim() ? `${prompt.trim()}\n\nDo not include: ${negative.trim()}` : prompt;
}

function nearest(values: readonly number[], target: number): number {
  return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best));
}

/** The supported ratio closest to a pixel size, compared on a log scale. */
function closestRatio(ratios: readonly string[], width: number, height: number): string {
  const target = Math.log(width / height);
  const score = (ratio: string) => {
    const [w = 1, h = 1] = ratio.split(":").map(Number);
    return Math.abs(Math.log(w / h) - target);
  };
  return ratios.reduce((best, ratio) => (score(ratio) < score(best) ? ratio : best));
}

function requireResolution(model: string, allowed: readonly string[], value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`Kling ${model} supports resolutions ${allowed.join(", ")}, not ${value}`);
  }
  return normalized;
}

function requireRatio(model: string, allowed: readonly string[], value: string): string {
  if (!allowed.includes(value)) {
    throw new Error(`Kling ${model} supports aspect ratios ${allowed.join(", ")}, not ${value}`);
  }
  return value;
}

/**
 * Kling takes images as a URL or raw Base64 without a `data:` prefix
 * (https://kling.ai/document-api/api/image/3-0-omni/image-generation.md).
 */
function encodeImage(bytes: Uint8Array, role: string, maxBytes: number): string {
  const mime = sniffImageMime(bytes);
  if (!mime || !INPUT_MIMES.has(mime)) throw new Error(`Kling ${role} must be a JPEG or PNG image`);
  if (bytes.length > maxBytes) throw new Error(`Kling ${role} exceeds the ${maxBytes / MB} MB limit`);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Kling AI (Kuaishou) video and image generation, called directly with a
 * Kling API key. Every generation is an asynchronous task: create it, poll
 * it, then download the result URL, which Kling keeps for 30 days.
 */
export class KlingProvider extends BaseProvider {
  private readonly apiKey: string;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image", "text_to_video", "image_to_video"];
  }

  static override requiredSecrets(): string[] {
    return ["KLING_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.KLING);
    const apiKey = secrets.KLING_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("KLING_API_KEY is required");
    }
    this.apiKey = apiKey.trim();
  }

  override getContainerEnv(): Record<string, string> {
    return { KLING_API_KEY: this.apiKey };
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("Kling does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    throw new Error("Kling does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_SPECS.map((spec) => ({
      id: spec.id,
      name: spec.name,
      provider: PROVIDER_IDS.KLING,
      supportedTasks: ["text_to_image", "image_to_image"],
      aspectRatios: spec.aspectRatios,
      resolutions: spec.resolutions
    }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [...VIDEO_MODELS];
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("Kling text-to-video requires a prompt");
    const spec = videoSpec(params.model.id);
    const prompt = withNegative(params.prompt, params.negativePrompt);
    const settings = this.videoSettings(spec, params);
    // The omni endpoint requires aspect_ratio when no frame or video is given.
    settings.aspect_ratio = params.aspectRatio
      ? requireRatio(spec.id, spec.aspectRatios, params.aspectRatio)
      : "16:9";
    const body = spec.omni
      ? { contents: [{ type: "prompt", text: prompt }], settings }
      : { prompt, settings };
    const path = spec.omni ? `/omni-video/${spec.id}` : `/text-to-video/${spec.id}`;
    return this.generateVideo(path, body, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("Kling image-to-video requires a first frame");
    const spec = videoSpec(params.model.id);
    const endImage = params.endImage && params.endImage.length > 0 ? params.endImage : null;
    if (endImage && spec.endFrame === "none") {
      throw new Error(`Kling ${spec.id} does not accept a last frame`);
    }
    const settings = this.videoSettings(spec, params);
    if (endImage && spec.id === "kling-2.6") {
      // Kling 2.6 first + last frame generation runs at 1080p only.
      if (settings.resolution && settings.resolution !== "1080p") {
        throw new Error("Kling 2.6 needs 1080p when a last frame is given");
      }
      settings.resolution = "1080p";
    }
    if (spec.id === "kling-o1" && !endImage && typeof settings.duration === "number") {
      // O1 with only a first frame renders 5 or 10 seconds.
      settings.duration = nearest([5, 10], settings.duration);
    }
    const contents: Record<string, string>[] = [];
    const prompt = params.prompt?.trim() ? withNegative(params.prompt, params.negativePrompt) : "";
    if (prompt) contents.push({ type: "prompt", text: prompt });
    contents.push({ type: "first_frame", url: encodeImage(image, "first frame", spec.maxImageBytes) });
    if (endImage) contents.push({ type: "last_frame", url: encodeImage(endImage, "last frame", spec.maxImageBytes) });
    const path = spec.omni ? `/omni-video/${spec.id}` : `/image-to-video/${spec.id}`;
    return this.generateVideo(path, { contents, settings }, params.signal, params.timeoutSeconds ?? VIDEO_TIMEOUT_SECONDS);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("Kling text-to-image requires a prompt");
    const spec = imageSpec(params.model.id);
    const body = this.imageBody(spec, params, params.aspectRatio, params.width, params.height);
    if (spec.path === "/v1/images/generations") {
      if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim();
    } else {
      body.prompt = withNegative(params.prompt, params.negativePrompt);
      // Image 3.0 Omni rejects `auto` for text-only requests, and auto is the omni default.
      body.aspect_ratio ??= "1:1";
    }
    return this.generateImage(spec, body, params.signal);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("Kling image-to-image requires a prompt");
    const spec = imageSpec(params.model.id);
    const sources = images.filter((image) => image.length > 0);
    if (sources.length === 0) throw new Error("Kling image-to-image requires at least one image");
    if (sources.length > spec.maxReferences) {
      throw new Error(`Kling ${spec.id} accepts at most ${spec.maxReferences} reference image${spec.maxReferences === 1 ? "" : "s"}`);
    }
    const body = this.imageBody(spec, params, params.aspectRatio, params.targetWidth, params.targetHeight);
    // negative_prompt is not accepted alongside an image, so it joins the prompt.
    body.prompt = withNegative(params.prompt, params.negativePrompt);
    const encoded = sources.map((image, index) =>
      encodeImage(image, sources.length > 1 ? `reference image ${index + 1}` : "reference image", MAX_REFERENCE_IMAGE_BYTES)
    );
    if (spec.path === "/v1/images/generations") {
      body.image = encoded[0];
    } else {
      body.image_list = encoded.map((image) => ({ image }));
    }
    return this.generateImage(spec, body, params.signal);
  }

  private videoSettings(spec: VideoSpec, params: TextToVideoParams | ImageToVideoParams): Record<string, unknown> {
    const settings: Record<string, unknown> = {};
    const resolution = requireResolution(spec.id, spec.resolutions, params.resolution);
    if (resolution) settings.resolution = resolution;
    if (params.durationSeconds && params.durationSeconds > 0) {
      settings.duration = nearest(spec.durations, Math.round(params.durationSeconds));
    }
    return settings;
  }

  private imageBody(
    spec: ImageSpec,
    params: TextToImageParams | ImageToImageParams,
    ratio?: string | null,
    width?: number | null,
    height?: number | null
  ): Record<string, unknown> {
    const body: Record<string, unknown> = { model_name: spec.id, prompt: params.prompt, n: 1 };
    const resolution = requireResolution(spec.id, spec.resolutions, params.resolution);
    if (resolution) body.resolution = resolution;
    if (ratio) {
      body.aspect_ratio = requireRatio(spec.id, spec.aspectRatios, ratio);
    } else if (width && height && width > 0 && height > 0) {
      body.aspect_ratio = closestRatio(spec.aspectRatios, width, height);
    }
    return body;
  }

  private headers(json = false): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  private async unwrap(response: Response, action: string): Promise<unknown> {
    const payload: unknown = await response.json().catch(() => null);
    const envelope = EnvelopeSchema.safeParse(payload);
    if (!response.ok || !envelope.success || envelope.data.code !== 0) {
      const code = envelope.success ? ` (code ${envelope.data.code})` : "";
      const message = envelope.success && envelope.data.message ? envelope.data.message : `HTTP ${response.status}`;
      throw new Error(`Kling ${action} failed${code}: ${message}`);
    }
    return envelope.data.data;
  }

  private async generateVideo(
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    timeoutSeconds: number
  ): Promise<Uint8Array> {
    signal?.throwIfAborted();
    // Creation is billed, so it is never retried.
    const createdData = await this.unwrap(
      await fetch(`${BASE_URL}${path}`, { method: "POST", headers: this.headers(true), body: JSON.stringify(body), signal }),
      "video creation"
    );
    const created = z.object({ id: z.string(), status: z.string() }).safeParse(createdData);
    if (!created.success) throw new Error("Kling video creation returned no task id");
    const id = created.data.id;
    await recordGenerationReceiptAsync({ provider_request_id: id });

    const task = await this.poll<VideoTask>(
      `${BASE_URL}/tasks?task_ids=${encodeURIComponent(id)}`,
      { id, status: created.data.status },
      (data) => {
        const tasks = z.array(VideoTaskSchema).safeParse(data);
        const found = tasks.success ? tasks.data.find((candidate) => candidate.id === id) : undefined;
        if (!found) throw new Error(`Kling video status returned no task ${id}`);
        return found;
      },
      (current) => current.status,
      VIDEO_TERMINAL,
      VIDEO_POLL_INTERVAL_MS,
      "video",
      signal,
      timeoutSeconds
    );
    if (task.status !== "succeeded") {
      throw new Error(`Kling video task ${id} ${task.status}: ${task.message || "no reason given"}`);
    }
    const url = task.outputs?.find((output) => output.type === "video" && output.url)?.url;
    if (!url) throw new Error(`Kling video task ${id} succeeded without a video URL`);
    return this.download(url, signal);
  }

  private async generateImage(spec: ImageSpec, body: Record<string, unknown>, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const createdData = await this.unwrap(
      await fetch(`${BASE_URL}${spec.path}`, { method: "POST", headers: this.headers(true), body: JSON.stringify(body), signal }),
      "image creation"
    );
    const created = ImageTaskSchema.safeParse(createdData);
    if (!created.success) throw new Error("Kling image creation returned no task id");
    const id = created.data.task_id;
    await recordGenerationReceiptAsync({ provider_request_id: id });

    const task = await this.poll<ImageTask>(
      `${BASE_URL}${spec.path}/${encodeURIComponent(id)}`,
      created.data,
      (data) => {
        const parsed = ImageTaskSchema.safeParse(data);
        if (!parsed.success) throw new Error(`Kling image status returned an invalid task ${id}`);
        return parsed.data;
      },
      (current) => current.task_status,
      IMAGE_TERMINAL,
      IMAGE_POLL_INTERVAL_MS,
      "image",
      signal,
      IMAGE_TIMEOUT_SECONDS
    );
    if (task.task_status !== "succeed") {
      throw new Error(`Kling image task ${id} ${task.task_status}: ${task.task_status_msg || "no reason given"}`);
    }
    const url = task.task_result?.images?.[0]?.url ?? task.task_result?.series_images?.[0]?.url;
    if (!url) throw new Error(`Kling image task ${id} succeeded without an image URL`);
    return this.download(url, signal);
  }

  /**
   * Kling documents no cancel endpoint, so a stopped or timed-out run leaves
   * the task to finish upstream; the caller only stops waiting for it.
   */
  private async poll<T>(
    url: string,
    initial: T,
    parse: (data: unknown) => T,
    statusOf: (task: T) => string,
    terminal: ReadonlySet<string>,
    interval: number,
    noun: string,
    signal: AbortSignal | undefined,
    timeoutSeconds: number
  ): Promise<T> {
    let current = initial;
    if (terminal.has(statusOf(current))) return current;
    const deadline = Date.now() + timeoutSeconds * 1000;
    const timeoutError = () => new Error(`Kling ${noun} task timed out while ${statusOf(current)}`);
    const timeout = new AbortController();
    const pollSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(timeoutError()), Math.max(0, deadline - Date.now()));
    const checkDeadline = () => {
      pollSignal.throwIfAborted();
      if (Date.now() >= deadline) throw timeoutError();
    };
    try {
      while (!terminal.has(statusOf(current))) {
        checkDeadline();
        await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), pollSignal);
        checkDeadline();
        const data = await this.unwrap(
          await fetchWithRetry(url, { headers: this.headers(), signal: pollSignal }),
          `${noun} status`
        );
        current = parse(data);
      }
      return current;
    } finally {
      clearTimeout(timer);
    }
  }

  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    // The result is already billed, so transient CDN failures are retried.
    const response = await fetchWithRetry(url, { signal }, {
      fetchImpl: async (input, init) => {
        const response = await safeFetch(String(input), init);
        if (!response.ok) return response;
        // Read inside the retry boundary so a broken stream retries the download, not the generation.
        return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
      }
    });
    if (!response.ok) throw new Error(`Kling result download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
