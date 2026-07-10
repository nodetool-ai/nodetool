import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  TextToImageParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.evolink");

// Evolink fronts two hosts: a synchronous OpenAI/Anthropic-compatible gateway
// for text models, and an asynchronous, task-based gateway for media. The
// chat path speaks Chat Completions against the gateway; image/video calls
// submit a task and poll for the result on the media host.
const EVOLINK_CHAT_BASE_URL = "https://direct.evolink.ai/v1";
const EVOLINK_MEDIA_BASE_URL = "https://api.evolink.ai";
const EVOLINK_FILE_UPLOAD_URL =
  "https://files-api.evolink.ai/api/v1/files/upload/base64";

interface EvolinkTaskStatus {
  status?: string;
  progress?: number;
  results?: string[];
  error?: { code?: string; message?: string; type?: string } | string | null;
}

/**
 * Image models reachable via `POST /v1/images/generations`. Every listed
 * model also accepts an `image_urls` array, so each supports both
 * text-to-image and image-to-image (editing).
 */
const EVOLINK_IMAGE_MODELS: ImageModel[] = [
  { id: "gpt-image-2", name: "GPT Image 2" },
  { id: "gpt-image-1.5", name: "GPT Image 1.5" },
  { id: "gemini-3.1-flash-image-preview", name: "Nano Banana 2" },
  { id: "doubao-seedream-5.0-lite", name: "Seedream 5.0 Lite" }
].map((m) => ({
  ...m,
  provider: "evolink" as const,
  supportedTasks: ["text_to_image", "image_to_image"]
}));

/**
 * Video models reachable via `POST /v1/videos/generations`. Evolink uses
 * distinct model ids per task for some families (e.g. Seedance, Wan), while
 * others (Veo, Sora) switch task by the presence of `image_urls` — reflected
 * in each model's `supportedTasks`.
 */
const EVOLINK_VIDEO_MODELS: VideoModel[] = [
  {
    id: "seedance-2.0-text-to-video",
    name: "Seedance 2.0 (Text to Video)",
    supportedTasks: ["text_to_video"],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
  },
  {
    id: "seedance-2.0-image-to-video",
    name: "Seedance 2.0 (Image to Video)",
    supportedTasks: ["image_to_video"],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
  },
  {
    id: "wan2.6-text-to-video",
    name: "Wan 2.6 (Text to Video)",
    supportedTasks: ["text_to_video"],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"]
  },
  {
    id: "wan2.6-image-to-video",
    name: "Wan 2.6 (Image to Video)",
    supportedTasks: ["image_to_video"],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"]
  },
  {
    id: "veo3.1-pro-beta",
    name: "Veo 3.1 Pro",
    supportedTasks: ["text_to_video", "image_to_video"],
    resolutions: ["720p"],
    aspectRatios: ["auto", "16:9", "9:16"]
  },
  {
    id: "sora-2-pro-preview",
    name: "Sora 2 Pro",
    supportedTasks: ["text_to_video", "image_to_video"],
    durations: [4, 8, 12],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"]
  },
  {
    id: "grok-imagine-image-to-video-beta",
    name: "Grok Imagine (Image to Video)",
    supportedTasks: ["image_to_video"],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1", "3:2", "2:3"]
  }
].map((m) => ({ ...m, provider: "evolink" as const }));

/**
 * Evolink provider. Speaks the OpenAI Chat Completions dialect against Evolink's
 * OpenAI-compatible gateway at https://direct.evolink.ai/v1 for chat (which
 * fronts GPT, Claude, Gemini, DeepSeek and other models behind a single API
 * key), and Evolink's asynchronous task API at https://api.evolink.ai for
 * image and video generation.
 */
export class EvolinkProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["EVOLINK_API_KEY"];
  }

  private _evolinkFetch: typeof fetch;

  constructor(
    secrets: { EVOLINK_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.EVOLINK_API_KEY;
    if (!apiKey) {
      throw new Error("EVOLINK_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: "evolink",
        apiKey,
        baseURL: EVOLINK_CHAT_BASE_URL
      },
      { ...options, fetchFn }
    );

    this._evolinkFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { EVOLINK_API_KEY: this.apiKey };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._evolinkFetch(`${EVOLINK_CHAT_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "evolink"
      }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return EVOLINK_IMAGE_MODELS;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return EVOLINK_VIDEO_MODELS;
  }

  // Evolink's media gateway has no speech-to-text, embedding, or built-in-voice
  // TTS endpoints (Qwen TTS requires a pre-created custom voice). Override the
  // OpenAIProvider lists so those OpenAI-only models don't surface under the
  // evolink provider id.
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [];
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [];
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: this.withNegativePrompt(params.prompt, params.negativePrompt)
    };

    const size = this.resolveEvolinkImageSize(
      params.aspectRatio,
      params.width,
      params.height
    );
    if (size) body.size = size;
    if (params.resolution) body.resolution = params.resolution;
    if (params.quality) body.quality = params.quality;

    return this.runMediaTask("/v1/images/generations", body);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const sources = images.filter((b) => b && b.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty.");
    }
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const imageUrls = await Promise.all(
      sources.map((b) => this.uploadImage(b))
    );
    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: this.withNegativePrompt(params.prompt, params.negativePrompt),
      image_urls: imageUrls
    };

    const size = this.resolveEvolinkImageSize(
      params.aspectRatio,
      params.targetWidth ?? undefined,
      params.targetHeight ?? undefined
    );
    if (size) body.size = size;
    if (params.resolution) body.resolution = params.resolution;
    if (params.quality) body.quality = params.quality;

    return this.runMediaTask("/v1/images/generations", body);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt
    };
    this.applyVideoParams(body, params);

    return this.runMediaTask("/v1/videos/generations", body);
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const image = images[0];
    if (!image || image.length === 0) {
      throw new Error("The input image cannot be empty.");
    }

    const imageUrl = await this.uploadImage(image);
    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt ?? "",
      image_urls: [imageUrl]
    };
    this.applyVideoParams(body, params);

    return this.runMediaTask("/v1/videos/generations", body);
  }

  private withNegativePrompt(
    prompt: string,
    negativePrompt?: string | null
  ): string {
    return negativePrompt
      ? `${prompt.trim()}\n\nDo not include: ${negativePrompt.trim()}`
      : prompt;
  }

  private resolveEvolinkImageSize(
    aspectRatio?: string | null,
    width?: number | null,
    height?: number | null
  ): string | undefined {
    if (aspectRatio) return aspectRatio;
    if (width && height) return `${width}x${height}`;
    return undefined;
  }

  private applyVideoParams(
    body: Record<string, unknown>,
    params: TextToVideoParams | ImageToVideoParams
  ): void {
    const duration = this.resolveVideoDuration(params);
    if (duration) body.duration = duration;
    // Evolink expresses video resolution through the `quality` field
    // (e.g. "720p", "1080p"), not a pixel size.
    if (params.resolution) body.quality = params.resolution;
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  }

  private resolveVideoDuration(
    params: TextToVideoParams | ImageToVideoParams
  ): number | undefined {
    if (params.durationSeconds && params.durationSeconds > 0) {
      return Math.round(params.durationSeconds);
    }
    if (params.numFrames && params.numFrames > 0) {
      return Math.max(1, Math.round(params.numFrames / 24));
    }
    return undefined;
  }

  private mediaHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  /** Upload raw image bytes and return a hosted URL Evolink can reference. */
  private async uploadImage(
    image: Uint8Array,
    mimeType = "image/png"
  ): Promise<string> {
    const base64 = Buffer.from(image).toString("base64");
    const response = await this._evolinkFetch(EVOLINK_FILE_UPLOAD_URL, {
      method: "POST",
      headers: this.mediaHeaders(),
      body: JSON.stringify({
        base64_data: `data:${mimeType};base64,${base64}`
      })
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as {
      success?: boolean;
      data?: { file_url?: string };
      msg?: string;
    };

    const fileUrl = payload.data?.file_url;
    if (!response.ok || !payload.success || !fileUrl) {
      throw new Error(
        `Evolink file upload failed: ${response.status} ${payload.msg ?? ""}`.trim()
      );
    }
    return fileUrl;
  }

  /** Submit a media task, poll until it completes, and download the result. */
  private async runMediaTask(
    path: string,
    body: Record<string, unknown>
  ): Promise<Uint8Array> {
    log.debug("Evolink media task", { path, model: body.model });
    const taskId = await this.submitMediaTask(path, body);
    const results = await this.pollMediaTask(taskId);
    const url = results[0];
    if (!url) {
      throw new Error(`Evolink task ${taskId} returned no results`);
    }
    return this.downloadResult(url);
  }

  private async submitMediaTask(
    path: string,
    body: Record<string, unknown>
  ): Promise<string> {
    const response = await this._evolinkFetch(`${EVOLINK_MEDIA_BASE_URL}${path}`, {
      method: "POST",
      headers: this.mediaHeaders(),
      body: JSON.stringify(body)
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as { id?: string; error?: unknown };
    if (!response.ok || !payload.id) {
      throw new Error(
        `Evolink task submit failed: ${response.status} ${JSON.stringify(
          payload
        )}`
      );
    }
    return payload.id;
  }

  private async pollMediaTask(
    taskId: string,
    pollIntervalMs = 3000,
    maxAttempts = 300
  ): Promise<string[]> {
    const url = `${EVOLINK_MEDIA_BASE_URL}/v1/tasks/${taskId}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this._evolinkFetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      if (!response.ok) {
        throw new Error(
          `Evolink task query failed: ${response.status} (taskId: ${taskId})`
        );
      }

      const data = (await response.json()) as EvolinkTaskStatus;
      if (data.status === "completed") {
        return data.results ?? [];
      }
      if (data.status === "failed") {
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ?? "Unknown error";
        throw new Error(`Evolink task failed: ${message} (taskId: ${taskId})`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const timeoutSeconds = (maxAttempts * pollIntervalMs) / 1000;
    throw new Error(
      `Evolink task timed out after ${timeoutSeconds}s (taskId: ${taskId})`
    );
  }

  private async downloadResult(url: string): Promise<Uint8Array> {
    const response = await this._evolinkFetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download Evolink result: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
