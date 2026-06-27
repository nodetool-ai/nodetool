import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { ImageModel, LanguageModel, VideoModel } from "./types.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

interface XAIProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
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
 * xAI (Grok) provider. Uses the OpenAI SDK against xAI's
 * OpenAI-compatible endpoint at https://api.x.ai/v1.
 */
export class XAIProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["XAI_API_KEY"];
  }

  private _xaiFetch: typeof fetch;

  constructor(
    secrets: { XAI_API_KEY?: string },
    options: XAIProviderOptions = {}
  ) {
    const apiKey = secrets.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: XAI_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "xai";
    this._xaiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { XAI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /** Fetch and validate the rows from xAI's `/v1/models` listing. */
  private async fetchModelRows(): Promise<XAIModelRow[]> {
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
}
