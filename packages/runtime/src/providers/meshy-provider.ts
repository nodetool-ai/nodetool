/**
 * Meshy AI Provider — wraps the Meshy AI 3D generation API to expose
 * `textTo3D` and `imageTo3D` through the standard {@link BaseProvider}
 * interface.
 *
 * Meshy AI offers two 3D generation modes:
 * - **Text-to-3D** — generate a 3D mesh from a text prompt.
 * - **Image-to-3D** — generate a 3D mesh from a single reference image.
 *
 * API docs: https://docs.meshy.ai/
 *
 * Ported from the historical Python implementation at
 * `nodetool-core@25e60910:src/nodetool/providers/meshy_provider.py`.
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool/config";
import type {
  ImageTo3DParams,
  Message,
  Model3D,
  ProviderStreamItem,
  TextTo3DParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.meshy");

const MESHY_API_BASE_URL = "https://api.meshy.ai";

/**
 * Default polling cadence. Tasks typically take 30s–5min; 5s polling keeps
 * latency low without overwhelming the API. Tests can shorten this via
 * {@link MeshyProviderOptions}.
 */
const DEFAULT_POLL_INTERVAL_MS = 5000;
/** Default cap of 10 minutes (`120 * 5s`). */
const DEFAULT_MAX_POLL_ATTEMPTS = 120;

const DEFAULT_OUTPUT_FORMAT = "glb";

/**
 * The 3D generation models exposed by Meshy. Mirrors `MESHY_3D_MODELS` in
 * the original Python provider; bump this list when Meshy ships new models.
 */
export const MESHY_3D_MODELS: Model3D[] = [
  {
    id: "meshy-4",
    name: "Meshy-4 Text-to-3D",
    provider: "meshy",
    supportedTasks: ["text_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  },
  {
    id: "meshy-3-turbo",
    name: "Meshy-3 Turbo Text-to-3D",
    provider: "meshy",
    supportedTasks: ["text_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  },
  {
    id: "meshy-4-image",
    name: "Meshy-4 Image-to-3D",
    provider: "meshy",
    supportedTasks: ["image_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  },
  {
    id: "meshy-3-turbo-image",
    name: "Meshy-3 Turbo Image-to-3D",
    provider: "meshy",
    supportedTasks: ["image_to_3d"],
    outputFormats: ["glb", "fbx", "obj", "usdz"]
  }
];

/**
 * Optional knobs for tests and advanced users. Production callers should leave
 * these at their defaults.
 */
export interface MeshyProviderOptions {
  /** Override the polling interval (ms). Defaults to 5000. */
  pollIntervalMs?: number;
  /** Override the max poll attempts. Defaults to 120 (= 10 minutes @ 5s). */
  maxPollAttempts?: number;
}

/** Detect PNG by magic header; everything else is treated as JPEG. */
function detectImageMime(image: Uint8Array): string {
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (image.length < PNG_MAGIC.length) return "image/jpeg";
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (image[i] !== PNG_MAGIC[i]) return "image/jpeg";
  }
  return "image/png";
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export class MeshyProvider extends BaseProvider {
  private readonly apiKey: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(
    secrets: Record<string, unknown> = {},
    options: MeshyProviderOptions = {}
  ) {
    super("meshy");
    this.apiKey = (secrets["MESHY_API_KEY"] as string) ?? "";
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    if (!this.apiKey) {
      log.warn("Meshy API key not configured");
    }
  }

  static override requiredSecrets(): string[] {
    return ["MESHY_API_KEY"];
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("meshy does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("meshy does not support chat generation");
  }

  override async getAvailable3DModels(): Promise<Model3D[]> {
    if (!this.apiKey) {
      log.debug("No Meshy API key configured, returning empty 3D model list");
      return [];
    }
    return MESHY_3D_MODELS;
  }

  override async textTo3D(params: TextTo3DParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("prompt must not be empty");
    if (!this.apiKey) throw new Error("Meshy API key is not configured");

    const maxAttempts = this.computeMaxAttempts(params.timeoutSeconds);
    const previewTaskId = await this.submitTextTo3D(params);
    log.debug(`Meshy text-to-3D preview task submitted: ${previewTaskId}`);

    const previewResult = await this.pollTaskStatus(
      previewTaskId,
      "/v2/text-to-3d",
      maxAttempts
    );

    if (params.enableTextures) {
      const refineTaskId = await this.submitRefine(previewTaskId);
      log.debug(`Meshy text-to-3D refine task submitted: ${refineTaskId}`);
      const refineResult = await this.pollTaskStatus(
        refineTaskId,
        "/v2/text-to-3d",
        maxAttempts
      );
      return this.downloadResultMesh(refineResult, params.outputFormat);
    }

    return this.downloadResultMesh(previewResult, params.outputFormat);
  }

  override async imageTo3D(
    image: Uint8Array,
    params: ImageTo3DParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0)
      throw new Error("image must not be empty");
    if (!this.apiKey) throw new Error("Meshy API key is not configured");

    const maxAttempts = this.computeMaxAttempts(params.timeoutSeconds);
    const imageUrl = this.encodeImageAsDataUri(image);
    const taskId = await this.submitImageTo3D(imageUrl);
    log.debug(`Meshy image-to-3D task submitted: ${taskId}`);

    const result = await this.pollTaskStatus(
      taskId,
      "/v1/image-to-3d",
      maxAttempts
    );
    return this.downloadResultMesh(result, params.outputFormat);
  }

  // --- internals ---

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  private computeMaxAttempts(timeoutSeconds: number | null | undefined): number {
    if (!timeoutSeconds || timeoutSeconds <= 0) {
      return this.maxPollAttempts;
    }
    return Math.max(1, Math.floor((timeoutSeconds * 1000) / this.pollIntervalMs));
  }

  private encodeImageAsDataUri(image: Uint8Array): string {
    const mime = detectImageMime(image);
    return `data:${mime};base64,${bytesToBase64(image)}`;
  }

  private async submitTextTo3D(params: TextTo3DParams): Promise<string> {
    const payload: Record<string, unknown> = {
      mode: "preview",
      prompt: params.prompt
    };
    if (params.artStyle) payload.art_style = params.artStyle;
    if (params.negativePrompt) payload.negative_prompt = params.negativePrompt;
    if (params.seed != null && params.seed >= 0) payload.seed = params.seed;

    return this.submitTask("/v2/text-to-3d", payload);
  }

  private async submitImageTo3D(imageUrl: string): Promise<string> {
    return this.submitTask("/v1/image-to-3d", { image_url: imageUrl });
  }

  private async submitRefine(previewTaskId: string): Promise<string> {
    return this.submitTask("/v2/text-to-3d", {
      mode: "refine",
      preview_task_id: previewTaskId
    });
  }

  private async submitTask(
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    const url = `${MESHY_API_BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    if (res.status !== 200 && res.status !== 202) {
      const errText = await res.text();
      throw new Error(`Meshy API error (${res.status}): ${errText}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const taskId = data.result;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error(
        `Meshy submit returned no task id: ${JSON.stringify(data)}`
      );
    }
    return taskId;
  }

  private async pollTaskStatus(
    taskId: string,
    endpoint: string,
    maxAttempts: number
  ): Promise<Record<string, unknown>> {
    const url = `${MESHY_API_BASE_URL}${endpoint}/${taskId}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(url, { headers: this.headers() });
      if (res.status !== 200) {
        const errText = await res.text();
        throw new Error(`Meshy API poll error (${res.status}): ${errText}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      const status = String(data.status ?? "").toUpperCase();

      if (status === "SUCCEEDED") return data;
      if (status === "FAILED" || status === "EXPIRED") {
        const taskError = data.task_error as
          | Record<string, unknown>
          | undefined;
        const message =
          (taskError?.message as string | undefined) ?? "Unknown error";
        throw new Error(`Meshy task failed: ${message}`);
      }
      log.debug(
        `Meshy task ${taskId} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`
      );
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
    throw new Error(
      `Meshy task ${taskId} timed out after ${(maxAttempts * this.pollIntervalMs) / 1000}s`
    );
  }

  private async downloadResultMesh(
    result: Record<string, unknown>,
    requestedFormat: string | undefined
  ): Promise<Uint8Array> {
    const format = (requestedFormat ?? DEFAULT_OUTPUT_FORMAT).toLowerCase();
    const modelUrls = result.model_urls as
      | Record<string, string | undefined>
      | undefined;
    const modelUrl = modelUrls?.[format] ?? modelUrls?.[DEFAULT_OUTPUT_FORMAT];
    if (!modelUrl) {
      throw new Error(
        `No model URL found in Meshy response for format: ${format}`
      );
    }
    const dlRes = await fetch(modelUrl);
    if (!dlRes.ok) {
      const errText = await dlRes.text().catch(() => "");
      throw new Error(
        `Failed to download Meshy result (${dlRes.status}): ${errText}`
      );
    }
    const bytes = new Uint8Array(await dlRes.arrayBuffer());
    log.debug(`Downloaded ${bytes.length} bytes of 3D model data from Meshy`);
    return bytes;
  }
}
