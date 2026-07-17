import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

/** Sniff the container type so image inputs keep the right MIME in their data URI. */
function detectImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // PNG and everything else default to PNG — xAI accepts both jpeg and png.
  return "image/png";
}

/**
 * Resolve an image input (raw bytes) into the base64 data URI xAI's JSON image
 * and video endpoints expect. Asset references are already resolved to bytes
 * upstream (ProcessingContext); xAI's `application/json` API cannot take the
 * multipart file uploads the OpenAI SDK sends, so we inline them here.
 */
function bytesToDataUri(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${detectImageMime(bytes)};base64,${base64}`;
}

/** Raw row from xAI's `/v1/models` listing. */
interface XAIModelRow {
  id: string;
  name?: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

type ModelModality = "language" | "image" | "video";

/**
 * Classify an xAI model by its modality. xAI returns every model (chat,
 * Grok Imagine image, Grok Imagine video) from a single `/v1/models` listing,
 * so we have to sort them ourselves. Prefer the `output_modalities` array when
 * present; otherwise fall back to the model id (e.g. `grok-imagine-video`).
 */
function classifyModel(row: XAIModelRow): ModelModality {
  const out = (row.output_modalities ?? []).map((m) => m.toLowerCase());
  if (out.includes("video")) {
    return "video";
  }
  if (out.includes("image")) {
    return "image";
  }
  if (out.includes("text")) {
    return "language";
  }

  const id = row.id.toLowerCase();
  if (id.includes("video")) {
    return "video";
  }
  if (id.includes("image")) {
    return "image";
  }
  return "language";
}

/**
 * xAI (Grok) provider. Speaks the OpenAI Chat Completions dialect against
 * xAI's OpenAI-compatible endpoint at https://api.x.ai/v1.
 */
export class XAIProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["XAI_API_KEY"];
  }

  private _xaiFetch: typeof fetch;

  constructor(
    secrets: { XAI_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { providerId: "xai", apiKey, baseURL: XAI_BASE_URL },
      { ...options, fetchFn }
    );

    this._xaiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { XAI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  private _modelRows: Promise<XAIModelRow[]> | null = null;

  /**
   * Fetch and validate the rows from xAI's `/v1/models` listing. The listing
   * covers every modality, so the language/image/video getters share one
   * request per instance. Empty results (bad key, transient failure) are not
   * cached, so a fixed key recovers without a new provider instance.
   */
  private fetchModelRows(): Promise<XAIModelRow[]> {
    this._modelRows ??= this.requestModelRows().then(
      (rows) => {
        if (rows.length === 0) this._modelRows = null;
        return rows;
      },
      (error) => {
        this._modelRows = null;
        throw error;
      }
    );
    return this._modelRows;
  }

  private async requestModelRows(): Promise<XAIModelRow[]> {
    const response = await this._xaiFetch(`${XAI_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<XAIModelRow | undefined>;
    };
    // Stryker disable next-line ArrayDeclaration: the fallback is filtered downstream (rows need a string id), so [] vs any array is observably identical.
    const rows = payload.data ?? [];
    return rows.filter(
      (row): row is XAIModelRow =>
        typeof row?.id === "string" && row.id.length > 0
    );
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const rows = await this.fetchModelRows();
    return rows
      .filter((row) => classifyModel(row) === "language")
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "xai" as const
      }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const rows = await this.fetchModelRows();
    return rows
      .filter((row) => classifyModel(row) === "image")
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "xai" as const,
        supportedTasks: ["text_to_image", "image_to_image"]
      }));
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const rows = await this.fetchModelRows();
    return rows
      .filter((row) => classifyModel(row) === "video")
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "xai" as const,
        supportedTasks: ["text_to_video", "image_to_video"]
      }));
  }

  private xaiHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  /** Decode an xAI image response (`{ data: [{ b64_json | url }] }`) to bytes. */
  private async decodeImageResponse(response: Response): Promise<Uint8Array> {
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `xAI image request failed: ${response.status}${detail ? ` ${detail}` : ""}`
      );
    }
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = payload.data?.[0];
    if (item?.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }
    if (item?.url) {
      const fetched = await this._xaiFetch(item.url);
      if (!fetched.ok) {
        throw new Error(`xAI image fetch failed: ${fetched.status}`);
      }
      return new Uint8Array(await fetched.arrayBuffer());
    }
    throw new Error("xAI image generation returned no image data.");
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt,
      n: 1,
      response_format: "b64_json"
    };
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;

    const response = await this._xaiFetch(`${XAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: this.xaiHeaders(),
      body: JSON.stringify(request)
    });
    return this.decodeImageResponse(response);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const sources = images.filter((b) => b && b.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty.");
    }
    if (sources.length > 3) {
      throw new Error(
        `xAI image edits accept at most 3 source images, got ${sources.length}.`
      );
    }
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    // xAI's edit endpoint is JSON-only (the OpenAI SDK's multipart images.edit
    // is rejected). Up to three source images may be supplied; send a single
    // object for one input and an array for multi-image edits.
    const imageRefs = sources.map((b) => ({
      url: bytesToDataUri(b),
      type: "image_url" as const
    }));

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt,
      image: imageRefs.length === 1 ? imageRefs[0] : imageRefs,
      response_format: "b64_json"
    };
    // A single input image keeps its own aspect ratio; only override when asked.
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;

    const response = await this._xaiFetch(`${XAI_BASE_URL}/images/edits`, {
      method: "POST",
      headers: this.xaiHeaders(),
      body: JSON.stringify(request)
    });
    return this.decodeImageResponse(response);
  }

  /**
   * Submit a video job to xAI's async endpoint and poll until it finishes.
   * Returns the rendered video bytes.
   */
  private async generateVideo(
    request: Record<string, unknown>,
    timeoutSeconds?: number | null
  ): Promise<Uint8Array> {
    const startResponse = await this._xaiFetch(
      `${XAI_BASE_URL}/videos/generations`,
      {
        method: "POST",
        headers: this.xaiHeaders(),
        body: JSON.stringify(request)
      }
    );
    if (!startResponse.ok) {
      const detail = await startResponse.text().catch(() => "");
      throw new Error(
        `xAI video request failed: ${startResponse.status}${detail ? ` ${detail}` : ""}`
      );
    }
    const { request_id: requestId } = (await startResponse.json()) as {
      request_id?: string;
    };
    if (!requestId) {
      throw new Error("xAI video create response did not contain a request_id");
    }

    // Non-positive timeouts mean "unset", not "expire immediately".
    const timeoutMs =
      (timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds : 600) * 1000;
    const intervalMs = 5000;
    const start = Date.now();

    for (;;) {
      const pollResponse = await this._xaiFetch(
        `${XAI_BASE_URL}/videos/${requestId}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      if (!pollResponse.ok) {
        throw new Error(`xAI video poll failed: ${pollResponse.status}`);
      }
      const data = (await pollResponse.json()) as {
        status?: string;
        video?: { url?: string };
        error?: { code?: string; message?: string };
      };

      if (data.status === "done") {
        const url = data.video?.url;
        if (!url) {
          throw new Error("xAI video result did not contain a video url");
        }
        const fetched = await this._xaiFetch(url);
        if (!fetched.ok) {
          throw new Error(`xAI video fetch failed: ${fetched.status}`);
        }
        return new Uint8Array(await fetched.arrayBuffer());
      }
      if (data.status === "failed" || data.status === "expired") {
        throw new Error(
          data.error?.message ?? `xAI video generation ${data.status}`
        );
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error("xAI video generation timed out");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Map our duration/frame params onto xAI's `duration` (1–15 seconds).
   * xAI takes any whole second in that range, so frame counts convert at an
   * assumed 24fps rather than snapping to another provider's duration grid.
   */
  private static resolveVideoDuration(params: {
    durationSeconds?: number | null;
    numFrames?: number | null;
  }): number | undefined {
    const seconds =
      params.durationSeconds && params.durationSeconds > 0
        ? params.durationSeconds
        : params.numFrames && params.numFrames > 0
          ? params.numFrames / 24
          : undefined;
    if (!seconds || !Number.isFinite(seconds)) return undefined;
    return Math.min(15, Math.max(1, Math.round(seconds)));
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt
    };
    const duration = XAIProvider.resolveVideoDuration(params);
    if (duration !== undefined) request.duration = duration;
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;

    return this.generateVideo(request, params.timeoutSeconds);
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const image = images.find((b) => b && b.length > 0);
    if (!image) {
      throw new Error("The input image cannot be empty.");
    }

    const request: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt ?? "",
      image: { url: bytesToDataUri(image), type: "image_url" }
    };
    const duration = XAIProvider.resolveVideoDuration(params);
    if (duration !== undefined) request.duration = duration;
    // Image-to-video defaults to the input image's aspect ratio; only override
    // when the caller explicitly asks for a different one.
    if (params.aspectRatio) request.aspect_ratio = params.aspectRatio;
    if (params.resolution) request.resolution = params.resolution;

    return this.generateVideo(request, params.timeoutSeconds);
  }
}
