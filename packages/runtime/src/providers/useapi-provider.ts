import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { z } from "zod";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import { BaseProvider } from "./base-provider.js";
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
  VideoModel
} from "./types.js";

const BASE_URL = "https://api.useapi.net/v1";
const IMAGE_MODELS = [
  ["google-flow/nano-banana-2-lite", "Google Flow Nano Banana 2 Lite"],
  ["google-flow/nano-banana-2", "Google Flow Nano Banana 2"],
  ["google-flow/nano-banana-pro", "Google Flow Nano Banana Pro"],
  ["dreamina/seedream-5.0-pro", "Dreamina Seedream 5.0 Pro"],
  ["dreamina/seedream-5.0-lite", "Dreamina Seedream 5.0 Lite"],
  ["dreamina/seedream-4.7", "Dreamina Seedream 4.7"],
  ["dreamina/seedream-4.6", "Dreamina Seedream 4.6"],
  ["dreamina/seedream-4.5", "Dreamina Seedream 4.5"],
  ["dreamina/seedream-4.1", "Dreamina Seedream 4.1"],
  ["dreamina/seedream-4.0", "Dreamina Seedream 4.0"],
  ["dreamina/nano-banana", "Dreamina Nano Banana"],
  ["dreamina/seedream-3.0", "Dreamina Seedream 3.0"]
] as const;
const VIDEO_MODELS = [
  ["google-flow/veo-3.1-fast", "Google Flow Veo 3.1 Fast"],
  ["google-flow/veo-3.1-quality", "Google Flow Veo 3.1 Quality"],
  ["google-flow/veo-3.1-lite", "Google Flow Veo 3.1 Lite"],
  ["google-flow/veo-3.1-lite-low-priority", "Google Flow Veo 3.1 Lite Lower Priority"],
  ["google-flow/omni-flash", "Google Flow Omni 1.1 Flash"],
  ["dreamina/seedance-2.5", "Dreamina Seedance 2.5"],
  ["dreamina/seedance-2.0", "Dreamina Seedance 2.0"],
  ["dreamina/seedance-2.0-fast", "Dreamina Seedance 2.0 Fast"],
  ["dreamina/seedance-2.0-mini", "Dreamina Seedance 2.0 Mini"],
  ["dreamina/seedance-1.5-pro", "Dreamina Seedance 1.5 Pro"],
  ["dreamina/seedance-1.0-pro", "Dreamina Seedance 1.0 Pro"],
  ["dreamina/seedance-1.0-mini", "Dreamina Seedance 1.0 Mini"],
  ["dreamina/seedance-1.0-fast", "Dreamina Seedance 1.0 Fast"],
  ["dreamina/sora2", "Dreamina Sora 2"]
] as const;

type Service = "google-flow" | "dreamina";
type Kind = "images" | "videos";

const FlowMediaSchema = z.object({
  videoUrl: z.string().optional(),
  image: z.object({
    generatedImage: z.object({
      fifeUrl: z.string().optional(),
      encodedImage: z.string().optional()
    }).optional()
  }).optional()
});

const UseapiJobSchema = z.object({
  jobid: z.string().optional(),
  jobId: z.string().optional(),
  status: z.string().optional(),
  error: z.unknown().optional(),
  assetRef: z.string().optional(),
  mediaGenerationId: z.object({ mediaGenerationId: z.string().optional() }).optional(),
  response: z.object({
    images: z.array(z.object({ imageUrl: z.string().optional() })).optional(),
    videoUrl: z.string().optional(),
    media: z.array(FlowMediaSchema).optional(),
    failureReasons: z.array(z.string()).optional()
  }).optional(),
  media: z.array(FlowMediaSchema).optional()
});

type UseapiJob = z.infer<typeof UseapiJobSchema>;

function parseModel(id: string, kind: Kind): { service: Service; model: string } {
  const catalog = kind === "images" ? IMAGE_MODELS : VIDEO_MODELS;
  if (!catalog.some(([candidate]) => candidate === id)) {
    throw new Error(`Unknown useapi ${kind} model: ${id}`);
  }
  const slash = id.indexOf("/");
  const service = id.slice(0, slash);
  if (service !== "google-flow" && service !== "dreamina") {
    throw new Error(`Unknown useapi service: ${service}`);
  }
  return { service, model: id.slice(slash + 1) };
}

function model(id: string, name: string, tasks: string[]): ImageModel & VideoModel {
  return { id, name, provider: PROVIDER_IDS.USEAPI, supportedTasks: tasks };
}

function flowAspect(ratio: string | null | undefined, video: boolean): string | undefined {
  if (!ratio) return undefined;
  if (ratio === "16:9") return video ? "landscape" : ratio;
  if (ratio === "9:16") return video ? "portrait" : ratio;
  return ratio;
}

function clean(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== null));
}

/** Media generation through the user's Google Flow and Dreamina accounts on useapi.net. */
export class UseapiProvider extends BaseProvider {
  private readonly token: string;
  private readonly flowEmail: string;
  private readonly dreaminaAccount: string;

  static override requiredSecrets(): string[] {
    return ["USEAPI_API_TOKEN"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.USEAPI);
    const token = secrets.USEAPI_API_TOKEN;
    if (typeof token !== "string" || !token.trim()) {
      throw new Error("USEAPI_API_TOKEN is required");
    }
    this.token = token;
    this.flowEmail = typeof secrets.USEAPI_GOOGLE_FLOW_EMAIL === "string"
      ? secrets.USEAPI_GOOGLE_FLOW_EMAIL.trim()
      : "";
    this.dreaminaAccount = typeof secrets.USEAPI_DREAMINA_ACCOUNT === "string"
      ? secrets.USEAPI_DREAMINA_ACCOUNT.trim()
      : "";
  }

  override getContainerEnv(): Record<string, string> {
    return { USEAPI_API_TOKEN: this.token, USEAPI_GOOGLE_FLOW_EMAIL: this.flowEmail, USEAPI_DREAMINA_ACCOUNT: this.dreaminaAccount };
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("useapi does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(_args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    throw new Error("useapi does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_MODELS.map(([id, name]) => model(id, name, ["text_to_image", "image_to_image"]));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return VIDEO_MODELS.map(([id, name]) => model(id, name, ["text_to_video", "image_to_video"]));
  }

  private async request(path: string, init: RequestInit): Promise<UseapiJob> {
    const response = init.method === "POST"
      ? await fetch(`${BASE_URL}/${path}`, init)
      : await fetchWithRetry(`${BASE_URL}/${path}`, init);
    const parsed = UseapiJobSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`useapi ${path} returned an invalid response`);
    }
    const job = parsed.data;
    if (!response.ok) {
      const reason = typeof job.error === "string" ? job.error : `HTTP ${response.status}`;
      throw new Error(`useapi ${path} failed: ${reason}`);
    }
    return job;
  }

  private headers(contentType = "application/json"): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": contentType };
  }

  private async submit(service: Service, kind: Kind, body: Record<string, unknown>, signal?: AbortSignal, timeoutMs = 600000): Promise<UseapiJob> {
    const job = await this.request(`${service}/${kind}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal
    });
    const jobId = job.jobid ?? job.jobId;
    if (jobId) {
      await recordGenerationReceiptAsync({ provider_request_id: jobId });
    }
    if (job.media && (kind === "images" || job.media.some((item) => item.videoUrl))) return job;
    if (!jobId) throw new Error(`useapi ${service} ${kind} returned no job ID or media`);
    const statusPath = service === "google-flow" ? `${service}/jobs/${encodeURIComponent(jobId)}` : `${service}/${kind}/${encodeURIComponent(jobId)}`;
    const deadline = Date.now() + timeoutMs;
    let current = job;
    while (current.status !== "completed" || (service === "google-flow" && kind === "videos" && !(current.response?.media ?? current.media)?.some((item) => item.videoUrl))) {
      if (current.status === "failed" || current.status === "cancelled") {
        const reasons = current.response?.failureReasons?.join(", ");
        throw new Error(`useapi ${service} ${kind} failed: ${reasons || (typeof current.error === "string" ? current.error : current.status)}`);
      }
      if (Date.now() >= deadline) throw new Error(`useapi ${service} ${kind} timed out for job ${jobId}`);
      await sleep(5000, signal);
      signal?.throwIfAborted();
      current = await this.request(statusPath, { headers: this.headers(), signal });
    }
    return current;
  }

  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await safeFetch(url, { signal });
    if (!response.ok) throw new Error(`useapi media download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async imageResult(service: Service, job: UseapiJob, signal?: AbortSignal): Promise<Uint8Array> {
    if (service === "dreamina") {
      const url = job.response?.images?.[0]?.imageUrl;
      if (url) return this.download(url, signal);
    } else {
      const image = (job.media ?? job.response?.media)?.find((item) => item.image?.generatedImage)?.image?.generatedImage;
      if (image?.fifeUrl) return this.download(image.fifeUrl, signal);
      if (image?.encodedImage) return Buffer.from(image.encodedImage, "base64");
    }
    throw new Error(`useapi ${service} image job completed without an image`);
  }

  private async videoResult(service: Service, job: UseapiJob, signal?: AbortSignal): Promise<Uint8Array> {
    const url = service === "dreamina" ? job.response?.videoUrl : (job.media ?? job.response?.media)?.find((item) => item.videoUrl)?.videoUrl;
    if (!url) throw new Error(`useapi ${service} video job completed without a video URL`);
    return this.download(url, signal);
  }

  private async uploadImage(service: Service, bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
    if (service === "dreamina" && !this.dreaminaAccount) {
      throw new Error("USEAPI_DREAMINA_ACCOUNT is required for Dreamina image references");
    }
    const path = service === "dreamina"
      ? `${service}/assets/${encodeURIComponent(this.dreaminaAccount)}`
      : `${service}/assets${this.flowEmail ? `/${encodeURIComponent(this.flowEmail)}` : ""}`;
    const result = await this.request(path, {
      method: "POST",
      headers: this.headers(sniffImageMime(bytes) ?? "image/png"),
      body: Buffer.from(bytes),
      signal
    });
    const ref = service === "dreamina" ? result.assetRef : result.mediaGenerationId?.mediaGenerationId;
    if (!ref) throw new Error(`useapi ${service} image upload returned no reference`);
    return ref;
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const { service, model: modelId } = parseModel(params.model.id, "images");
    const body = service === "google-flow"
      ? clean({ model: modelId, prompt: params.prompt, email: this.flowEmail || undefined, aspectRatio: flowAspect(params.aspectRatio, false), seed: params.seed, count: 1 })
      : clean({ model: modelId, prompt: params.prompt, account: this.dreaminaAccount || undefined, ratio: params.aspectRatio, resolution: params.resolution });
    return this.imageResult(service, await this.submit(service, "images", body, params.signal), params.signal);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    if (images.length === 0) throw new Error("useapi image-to-image requires an input image");
    const { service, model: modelId } = parseModel(params.model.id, "images");
    if (service === "google-flow" && images.length > 1 && !this.flowEmail) {
      throw new Error("USEAPI_GOOGLE_FLOW_EMAIL is required for multiple reference images");
    }
    if (images.length > (service === "google-flow" ? 10 : 6)) {
      throw new Error(`useapi ${service} accepts fewer reference images`);
    }
    const refs = await Promise.all(images.map((bytes) => this.uploadImage(service, bytes, params.signal)));
    const fields = Object.fromEntries(refs.map((ref, index) => [service === "google-flow" ? `reference_${index + 1}` : `imageRef_${index + 1}`, ref]));
    const body = service === "google-flow"
      ? clean({ model: modelId, prompt: params.prompt, email: this.flowEmail || undefined, aspectRatio: flowAspect(params.aspectRatio, false), seed: params.seed, count: 1, ...fields })
      : clean({ model: modelId, prompt: params.prompt, account: this.dreaminaAccount || undefined, ratio: params.aspectRatio, resolution: params.resolution, imageStrength: params.strength, ...fields });
    return this.imageResult(service, await this.submit(service, "images", body, params.signal), params.signal);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const { service, model: modelId } = parseModel(params.model.id, "videos");
    const body = service === "google-flow"
      ? clean({ model: modelId, prompt: params.prompt, email: this.flowEmail || undefined, aspectRatio: flowAspect(params.aspectRatio, true), duration: params.durationSeconds, async: true })
      : clean({ model: modelId, prompt: params.prompt, account: this.dreaminaAccount || undefined, ratio: params.aspectRatio, duration: params.durationSeconds, resolution: params.resolution });
    return this.videoResult(service, await this.submit(service, "videos", body, params.signal, (params.timeoutSeconds ?? 600) * 1000), params.signal);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    const { service, model: modelId } = parseModel(params.model.id, "videos");
    if (service === "google-flow" && params.endImage && !this.flowEmail) {
      throw new Error("USEAPI_GOOGLE_FLOW_EMAIL is required for start and end frames");
    }
    const start = await this.uploadImage(service, image, params.signal);
    const end = params.endImage ? await this.uploadImage(service, params.endImage, params.signal) : undefined;
    const body = service === "google-flow"
      ? clean({ model: modelId, prompt: params.prompt ?? "", email: this.flowEmail || undefined, startImage: start, endImage: end, duration: params.durationSeconds, async: true })
      : clean({ model: modelId, prompt: params.prompt ?? "", account: this.dreaminaAccount || undefined, firstFrameRef: start, endFrameRef: end, duration: params.durationSeconds, resolution: params.resolution });
    return this.videoResult(service, await this.submit(service, "videos", body, params.signal, (params.timeoutSeconds ?? 600) * 1000), params.signal);
  }
}
