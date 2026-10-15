import { randomUUID } from "node:crypto";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { z } from "zod";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { fetchWithRetry, sleep } from "./http-transport.js";
import { sniffImageMime } from "./image-mime.js";
import { safeFetch } from "./safe-url.js";
import type {
  ImageToVideoParams,
  Message,
  ProviderStreamItem,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const BASE_URL = "https://api.vgenv.com/v2";
const API_MODEL = "minimax/h3";
const TIERS = [
  ["fast", "MiniMax H3 Fast"],
  ["standard", "MiniMax H3 Standard"],
  ["enhanced", "MiniMax H3 Enhanced"],
  ["quality", "MiniMax H3 Quality"]
] as const;
type Tier = (typeof TIERS)[number][0];

const DURATIONS = Array.from({ length: 12 }, (_, index) => index + 4);
const RESOLUTIONS = ["480p", "768p"];
const ASPECT_RATIOS = ["9:16", "2:3", "3:4", "1:1", "4:3", "3:2", "16:9", "21:9"];
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 9;
const POLL_INTERVAL_MS = 8000;
const DEFAULT_TIMEOUT_SECONDS = 30 * 60;
const CANCEL_TIMEOUT_MS = 5000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

const VideoSchema = z.object({
  id: z.string(),
  status: z.string(),
  progress: z.number().nullish(),
  queue_position: z.number().nullish(),
  output: z.object({ url: z.string() }).nullish(),
  error: z.unknown().optional()
});

type Video = z.infer<typeof VideoSchema>;

type ImageItem = { type: "image_url"; image_url: { url: string } };

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message) return record.message;
    if (record.error !== undefined) return errorMessage(record.error, fallback);
  }
  return fallback;
}

function parseTier(modelId: string): Tier {
  const tier = TIERS.find(([candidate]) => `${API_MODEL}-${candidate}` === modelId);
  if (!tier) throw new Error(`Unknown vgenv video model: ${modelId}`);
  return tier[0];
}

function imageItem(bytes: Uint8Array, role: string): ImageItem {
  const mime = sniffImageMime(bytes);
  if (!mime || !IMAGE_MIMES.has(mime)) {
    throw new Error(`vgenv ${role} must be a JPEG, PNG, or WebP image`);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`vgenv ${role} exceeds the 5 MiB image limit`);
  }
  const url = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  return { type: "image_url", image_url: { url } };
}

/**
 * MiniMax H3 video generation through vgenv.com, an independent BYOK API.
 * Creation is asynchronous: submit, poll the Video resource, then download
 * the short-lived signed result URL.
 */
export class VgenvProvider extends BaseProvider {
  private readonly apiKey: string;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_video", "image_to_video", "reference_to_video"];
  }

  static override requiredSecrets(): string[] {
    return ["VGENV_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.VGENV);
    const apiKey = secrets.VGENV_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("VGENV_API_KEY is required");
    }
    this.apiKey = apiKey.trim();
  }

  override getContainerEnv(): Record<string, string> {
    return { VGENV_API_KEY: this.apiKey };
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("vgenv does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    throw new Error("vgenv does not support chat generation");
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return TIERS.map(([tier, name]) => ({
      id: `${API_MODEL}-${tier}`,
      name,
      provider: PROVIDER_IDS.VGENV,
      supportedTasks: ["text_to_video", "image_to_video", "reference_to_video"],
      durations: DURATIONS,
      resolutions: RESOLUTIONS,
      aspectRatios: ASPECT_RATIOS
    }));
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt?.trim()) throw new Error("vgenv text-to-video requires a prompt");
    return this.generate(this.body(params), params);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    if (image.length === 0) throw new Error("vgenv image-to-video requires a first frame");
    const frames = [{ ...imageItem(image, "first frame"), frame_type: "first_frame" }];
    if (params.endImage && params.endImage.length > 0) {
      frames.push({ ...imageItem(params.endImage, "last frame"), frame_type: "last_frame" });
    }
    return this.generate({ ...this.body(params), frame_images: frames }, params);
  }

  override async referenceToVideo(inputs: ReferenceToVideoInputs, params: ReferenceToVideoParams): Promise<Uint8Array> {
    if (inputs.videos.some((video) => video.length > 0)) {
      throw new Error("vgenv reference-to-video accepts images only");
    }
    const images = inputs.images.filter((image) => image.length > 0);
    if (images.length === 0) throw new Error("vgenv reference-to-video requires at least one reference image");
    if (images.length > MAX_REFERENCE_IMAGES) {
      throw new Error(`vgenv accepts at most ${MAX_REFERENCE_IMAGES} reference images`);
    }
    if (!params.prompt?.trim()) throw new Error("vgenv reference-to-video requires a prompt");
    const references = images.map((image, index) => imageItem(image, `reference image ${index + 1}`));
    return this.generate({ ...this.body(params), reference_images: references }, params);
  }

  private body(params: TextToVideoParams | ImageToVideoParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: API_MODEL,
      tier: parseTier(params.model.id),
      prompt: params.prompt ?? "",
      // /v2 rewrites prompts by default. NodeTool sends what the user wrote.
      prompt_optimization: { mode: "raw" }
    };
    if (params.durationSeconds && params.durationSeconds > 0) {
      body.duration = Math.min(15, Math.max(4, Math.round(params.durationSeconds)));
    }
    if (params.resolution) body.resolution = params.resolution;
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    return body;
  }

  private headers(json = false): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  private async parse(response: Response, action: string): Promise<Video> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`vgenv ${action} failed: ${errorMessage(payload, `HTTP ${response.status}`)}`);
    }
    const parsed = VideoSchema.safeParse(payload);
    if (!parsed.success) throw new Error(`vgenv ${action} returned an invalid Video resource`);
    return parsed.data;
  }

  private async generate(
    body: Record<string, unknown>,
    params: { signal?: AbortSignal; timeoutSeconds?: number | null }
  ): Promise<Uint8Array> {
    const { signal } = params;
    signal?.throwIfAborted();
    // Creation is billed, so it is never retried. The key lets a caller that
    // repeats this exact request receive the same Video instead of a second charge.
    const created = await this.parse(
      await fetch(`${BASE_URL}/videos`, {
        method: "POST",
        headers: { ...this.headers(true), "Idempotency-Key": randomUUID() },
        body: JSON.stringify(body),
        signal
      }),
      "video creation"
    );
    await recordGenerationReceiptAsync({ provider_request_id: created.id });

    const video = await this.waitForVideo(created, params);
    if (video.status !== "succeeded") {
      throw new Error(`vgenv video ${video.id} ${video.status}: ${errorMessage(video.error, "no reason given")}`);
    }
    if (!video.output?.url) throw new Error(`vgenv video ${video.id} succeeded without an output URL`);
    return this.download(video.output.url, signal);
  }

  private async waitForVideo(
    created: Video,
    params: { signal?: AbortSignal; timeoutSeconds?: number | null }
  ): Promise<Video> {
    const { signal } = params;
    const path = `${BASE_URL}/videos/${encodeURIComponent(created.id)}`;
    const timeout = new AbortController();
    const pollingSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(), (params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000);
    let current = created;
    try {
      while (!TERMINAL.has(current.status)) {
        pollingSignal.throwIfAborted();
        await sleep(POLL_INTERVAL_MS, pollingSignal);
        pollingSignal.throwIfAborted();
        current = await this.parse(
          await fetchWithRetry(path, { headers: this.headers(), signal: pollingSignal }),
          "video status"
        );
        pollingSignal.throwIfAborted();
      }
    } catch (error) {
      // An abort can land in the sleep or inside the status request.
      if (timeout.signal.aborted || signal?.aborted) await this.cancel(created.id);
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      if (timeout.signal.aborted) {
        throw new Error(`vgenv video ${created.id} timed out while ${current.status}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    return current;
  }

  /**
   * Best-effort cancellation. vgenv cancels only preparing and queued jobs
   * and releases the reserved balance. A running job finishes and is billed,
   * so a failure here must not mask the abort or timeout that triggered it.
   */
  private async cancel(id: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CANCEL_TIMEOUT_MS);
    try {
      await fetch(`${BASE_URL}/videos/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: this.headers(),
        signal: controller.signal
      });
    } catch {
      // The caller is already failing with the abort or timeout reason.
    } finally {
      clearTimeout(timer);
    }
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
    if (!response.ok) throw new Error(`vgenv result download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
