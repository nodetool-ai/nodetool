/**
 * FAL AI Provider — wraps the @fal-ai/client SDK to provide image generation
 * through the standard BaseProvider interface.
 *
 * Supports: textToImage, imageToImage, getAvailableImageModels
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool/config";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  ImageToImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.fal");

const FAL_IMAGE_MODELS: ImageModel[] = [
  // FLUX Models
  { id: "fal-ai/flux/dev", name: "FLUX.1 Dev", provider: "fal_ai" },
  { id: "fal-ai/flux/schnell", name: "FLUX.1 Schnell", provider: "fal_ai" },
  { id: "fal-ai/flux-pro/v1.1", name: "FLUX.1 Pro v1.1", provider: "fal_ai" },
  {
    id: "fal-ai/flux-pro/v1.1-ultra",
    name: "FLUX.1 Pro Ultra",
    provider: "fal_ai"
  },
  { id: "fal-ai/flux-pro/new", name: "FLUX.1 Pro (New)", provider: "fal_ai" },
  { id: "fal-ai/flux-lora", name: "FLUX.1 Dev with LoRA", provider: "fal_ai" },
  // Ideogram Models
  { id: "fal-ai/ideogram/v2", name: "Ideogram v2", provider: "fal_ai" },
  {
    id: "fal-ai/ideogram/v2/turbo",
    name: "Ideogram v2 Turbo",
    provider: "fal_ai"
  },
  // Recraft Models
  { id: "fal-ai/recraft-v3", name: "Recraft v3", provider: "fal_ai" },
  { id: "fal-ai/recraft-20b", name: "Recraft 20B", provider: "fal_ai" },
  // Stable Diffusion Models
  {
    id: "fal-ai/stable-diffusion-v3-medium",
    name: "Stable Diffusion v3 Medium",
    provider: "fal_ai"
  },
  {
    id: "fal-ai/stable-diffusion-v35-large",
    name: "Stable Diffusion v3.5 Large",
    provider: "fal_ai"
  },
  { id: "fal-ai/fast-sdxl", name: "Fast SDXL", provider: "fal_ai" },
  // Other Models
  { id: "fal-ai/luma-photon", name: "Luma Photon", provider: "fal_ai" },
  {
    id: "fal-ai/luma-photon/flash",
    name: "Luma Photon Flash",
    provider: "fal_ai"
  },
  { id: "fal-ai/imagen4/preview", name: "Imagen 4 Preview", provider: "fal_ai" }
];

type FalClient = {
  subscribe(
    endpoint: string,
    opts: { input: Record<string, unknown>; logs?: boolean }
  ): Promise<{ data?: Record<string, unknown> }>;
};

export class FalProvider extends BaseProvider {
  private apiKey: string;
  private _client: FalClient | null = null;

  static override requiredSecrets(): string[] {
    return ["FAL_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("fal_ai");
    this.apiKey = (secrets["FAL_API_KEY"] as string) ?? "";
  }

  private async getClient(): Promise<FalClient> {
    if (this._client) return this._client;
    const { createFalClient } = await import("@fal-ai/client");
    this._client = createFalClient({
      credentials: this.apiKey
    }) as unknown as FalClient;
    return this._client;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return FAL_IMAGE_MODELS;
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("fal_ai does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("fal_ai does not support chat generation");
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const client = await this.getClient();
    const args: Record<string, unknown> = {
      prompt: params.prompt,
      output_format: "png"
    };
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.width && params.height) {
      args.image_size = { width: params.width, height: params.height };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL textToImage", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const imageUrl = extractImageUrl(data);
    return downloadBytes(imageUrl);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const b64 = Buffer.from(image).toString("base64");
    const imageDataUri = `data:image/png;base64,${b64}`;

    const args: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: imageDataUri,
      output_format: "png"
    };
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.strength != null) args.strength = params.strength;
    if (params.targetWidth && params.targetHeight) {
      args.image_size = {
        width: params.targetWidth,
        height: params.targetHeight
      };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    const modelId = params.model.id;
    log.debug("FAL imageToImage", { model: modelId });
    const result = await client.subscribe(modelId, { input: args, logs: true });
    const data = (result.data ?? result) as Record<string, unknown>;
    const imageUrl = extractImageUrl(data);
    return downloadBytes(imageUrl);
  }
}

function extractImageUrl(result: Record<string, unknown>): string {
  const images = result.images as Array<Record<string, unknown>> | undefined;
  if (images && images.length > 0) {
    const url = images[0].url as string | undefined;
    if (url) return url;
  }
  const image = result.image as Record<string, unknown> | undefined;
  if (image?.url) return image.url as string;
  throw new Error(`Unexpected FAL response format: ${JSON.stringify(result)}`);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download FAL result: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
