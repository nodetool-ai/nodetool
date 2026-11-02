/**
 * Wan2GP provider: the `wangp` provider id, served by a Wan2GP server the
 * user runs themselves.
 *
 * Every call goes over MCP through {@link Wan2GPClient}. The composer, the
 * Create view and presets list the server's models and generate with them.
 * NodeTool never runs Wan2GP itself, because WanGP's license forbids
 * embedding it in a paid product.
 *
 * The server address is `WAN2GP_MCP_URL`, default `http://127.0.0.1:7866/mcp`.
 * `WAN2GP_MCP_TOKEN` is the bearer token for a server behind an
 * authenticating proxy, such as the nodetool-wan2gp combined image.
 * Start the server with `python wgp.py --mcp --mcp-async`.
 */

import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import {
  WAN2GP_DEFAULT_SERVER_URL,
  WAN2GP_MAX_MEDIA_BYTES,
  Wan2GPClient,
  Wan2GPError,
  wan2gpImageFilename,
  type Wan2GPRecord
} from "./wan2gp-client.js";
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

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.wangp");

/** Overall deadline for one generation when the caller sets none. */
const DEFAULT_TIMEOUT_SECONDS = 1800;
const POLL_INTERVAL_MS = 1_000;

type Task = "text_to_video" | "image_to_video" | "reference_to_video" | "text_to_image" | "image_to_image";

/** NodeTool task -> the Wan2GP capability that enables it. */
const VIDEO_TASKS: ReadonlyArray<[Task, string]> = [
  ["text_to_video", "text_to_video"],
  ["image_to_video", "image_to_video"],
  ["reference_to_video", "reference_images"]
];
const IMAGE_TASKS: ReadonlyArray<[Task, string]> = [
  ["text_to_image", "text_to_image"],
  ["image_to_image", "image_to_image"]
];

interface GenerationParams {
  model: { id: string };
  prompt?: string | null;
  negativePrompt?: string | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
  guidanceScale?: number | null;
  strength?: number | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  width?: number | null;
  height?: number | null;
  numFrames?: number | null;
  durationSeconds?: number | null;
  timeoutSeconds?: number | null;
  signal?: AbortSignal;
}

/**
 * Return a `WxH` resolution from a tier such as `720p`, or from a size. A
 * tier sets the short side and the aspect ratio, `16:9` by default, sets the
 * long one. Wan2GP aligns the result to its own block size.
 */
export function wan2gpResolution(params: GenerationParams): string | undefined {
  const value = params.resolution?.trim();
  if (value) {
    const tier = /^(\d+)\s*[pP]$/.exec(value);
    if (!tier) return value;
    const short = Number(tier[1]);
    const ratio = params.aspectRatio?.trim() || "16:9";
    const parts = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio);
    const across = parts ? Number(parts[1]) : 0;
    const down = parts ? Number(parts[2]) : 0;
    if (!(across > 0 && down > 0)) {
      throw new Wan2GPError(`Invalid aspect ratio: ${JSON.stringify(ratio)}`);
    }
    return across >= down
      ? `${Math.round((short * across) / down)}x${short}`
      : `${short}x${Math.round((short * down) / across)}`;
  }
  if (params.width && params.height) {
    return `${Math.trunc(params.width)}x${Math.trunc(params.height)}`;
  }
  return undefined;
}

/** Map NodeTool generation params to Wan2GP settings, without media. */
export function wan2gpBaseSettings(
  output: "video" | "image",
  params: GenerationParams
): Wan2GPRecord {
  const modelType = params.model.id.trim();
  if (!modelType) throw new Wan2GPError("The request names no Wan2GP model.");
  const settings: Wan2GPRecord = { model_type: modelType, prompt: params.prompt ?? "" };
  const optional: Array<[string, unknown]> = [
    ["negative_prompt", params.negativePrompt],
    ["num_inference_steps", params.numInferenceSteps],
    ["seed", params.seed],
    ["guidance_scale", params.guidanceScale],
    ["denoising_strength", params.strength]
  ];
  for (const [key, value] of optional) {
    if (value !== null && value !== undefined && value !== "") settings[key] = value;
  }
  const resolution = wan2gpResolution(params);
  if (resolution) settings.resolution = resolution;
  if (output === "video") {
    if (params.numFrames) {
      settings.video_length = Math.trunc(params.numFrames);
    } else if (params.durationSeconds) {
      settings.video_length = `${params.durationSeconds}s`;
    }
  } else {
    // Selects the image output on models that also make video, such as H3.
    settings.image_mode = 1;
  }
  return settings;
}

export class Wan2GPProvider extends BaseProvider {
  readonly serverUrl: string;
  private readonly token: string;

  constructor(kwargs: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.WANGP);
    const configured = kwargs["WAN2GP_MCP_URL"];
    this.serverUrl =
      typeof configured === "string" && configured.trim()
        ? configured.trim()
        : WAN2GP_DEFAULT_SERVER_URL;
    const token = kwargs["WAN2GP_MCP_TOKEN"];
    this.token = typeof token === "string" ? token.trim() : "";
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_video", "image_to_video", "reference_to_video", "text_to_image", "image_to_image"];
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("wangp does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("wangp does not support chat generation");
  }

  private connect(signal?: AbortSignal): Promise<Wan2GPClient> {
    return Wan2GPClient.connect(this.serverUrl, {
      maxTransferBytes: WAN2GP_MAX_MEDIA_BYTES,
      signal,
      ...(this.token && { token: this.token })
    });
  }

  private async withClient<T>(signal: AbortSignal | undefined, fn: (client: Wan2GPClient) => Promise<T>): Promise<T> {
    const client = await this.connect(signal);
    try {
      return await fn(client);
    } finally {
      await client.close();
    }
  }

  /** Models of one main output, with the tasks their capabilities enable. */
  private async listModels(mainOutput: "video" | "image", tasks: ReadonlyArray<[Task, string]>) {
    let rows: Wan2GPRecord[];
    try {
      rows = await this.withClient(undefined, (client) =>
        client.searchAllModels("", { main_output: mainOutput })
      );
    } catch (error) {
      // No server running is the ordinary case on a machine without one.
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.debug("Wan2GP model listing failed", { error: String(error) });
      return [];
    }
    const models: Array<{ id: string; name: string; supportedTasks: Task[] }> = [];
    for (const row of rows) {
      const capabilities = new Set(Array.isArray(row.capabilities) ? row.capabilities.map(String) : []);
      const supportedTasks = tasks.filter(([, capability]) => capabilities.has(capability)).map(([task]) => task);
      const id = String(row.model_type ?? "").trim();
      if (!id || supportedTasks.length === 0) continue;
      models.push({ id, name: String(row.name ?? id), supportedTasks });
    }
    return models;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const models = await this.listModels("video", VIDEO_TASKS);
    return models.map((model) => ({ ...model, provider: PROVIDER_IDS.WANGP }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const models = await this.listModels("image", IMAGE_TASKS);
    return models.map((model) => ({ ...model, provider: PROVIDER_IDS.WANGP }));
  }

  /** Run one generation and return the bytes of its first gallery item. */
  private async generate(
    output: "video" | "image",
    params: GenerationParams,
    media: (client: Wan2GPClient, settings: Wan2GPRecord) => Promise<void>
  ): Promise<Uint8Array> {
    const settings = wan2gpBaseSettings(output, params);
    const timeoutMs = (params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
    return this.withClient(params.signal, async (client) => {
      await media(client, settings);
      const jobId = await client.submit(settings);
      const job = await client.pollUntilDone(jobId, {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs,
        signal: params.signal
      });
      const { data } = await client.downloadFirstOutput(job, [output]);
      return data;
    });
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    return this.generate("video", params, async () => undefined);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    return this.generate("video", params, async (client, settings) => {
      settings.image_start = await uploadImage(client, image);
      if (params.endImage && params.endImage.length > 0) {
        settings.image_end = await uploadImage(client, params.endImage);
      }
    });
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    if (inputs.videos.length > 0 || (inputs.audios?.length ?? 0) > 0) {
      throw new Wan2GPError(
        "The wangp provider sends reference images only. Use the Wan2GP Generate node for video or audio inputs."
      );
    }
    const images = inputs.images.filter((image) => image.length > 0);
    if (images.length === 0) {
      throw new Wan2GPError("reference_to_video needs at least one reference image.");
    }
    return this.generate("video", params, async (client, settings) => {
      const refs: string[] = [];
      for (const image of images) refs.push(await uploadImage(client, image));
      settings.image_refs = refs;
    });
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.generate("image", params, async () => undefined);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    const sources = images.filter((image) => image.length > 0);
    if (sources.length === 0) throw new Wan2GPError("image must not be empty");
    return this.generate(
      "image",
      { ...params, width: params.targetWidth, height: params.targetHeight },
      async (client, settings) => {
        const modelType = String(settings.model_type);
        const metadata = await client.getModelCapabilities(modelType);
        const inputs = metadata.media_inputs;
        const roles =
          typeof inputs === "object" && inputs !== null && Array.isArray((inputs as Wan2GPRecord).image)
            ? ((inputs as Wan2GPRecord).image as unknown[]).map(String)
            : [];
        if (roles.includes("start")) {
          settings.image_start = await uploadImage(client, sources[0]);
        } else if (roles.includes("reference")) {
          const refs: string[] = [];
          for (const image of sources) refs.push(await uploadImage(client, image));
          settings.image_refs = refs;
        } else {
          throw new Wan2GPError(`Wan2GP model ${modelType} takes no input image.`);
        }
      }
    );
  }
}

function uploadImage(client: Wan2GPClient, image: Uint8Array): Promise<string> {
  return client.uploadMedia(wan2gpImageFilename(image), image);
}
