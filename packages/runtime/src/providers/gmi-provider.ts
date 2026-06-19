import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  TTSModel,
  VideoModel
} from "./types.js";

// GMI Cloud's OpenAI-compatible inference gateway is served from
// gmi-serving.com. The docs reference api.gmicloud.ai, but that hostname has
// no DNS record — the live serving host is api.gmi-serving.com.
const GMI_BASE_URL = "https://api.gmi-serving.com/v1";

interface GMIProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * GMI Cloud provider. Uses the OpenAI SDK against GMI Cloud's
 * OpenAI-compatible inference gateway at https://api.gmi-serving.com/v1, which
 * serves open-weight chat models (Llama, DeepSeek, Qwen, …) behind a single
 * API key. See https://docs.gmicloud.ai/quickstart.
 */
export class GMIProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["GMI_API_KEY"];
  }

  private _gmiFetch: typeof fetch;

  constructor(secrets: { GMI_API_KEY?: string }, options: GMIProviderOptions = {}) {
    const apiKey = secrets.GMI_API_KEY;
    if (!apiKey) {
      throw new Error("GMI_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: "gmi",
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: GMI_BASE_URL
            })),
        fetchFn
      }
    );

    this._gmiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { GMI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._gmiFetch(`${GMI_BASE_URL}/models`, {
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
        provider: "gmi"
      }));
  }

  // GMI's OpenAI-compatible gateway exposes chat models only; suppress the
  // OpenAI media/embedding defaults so they don't surface under the gmi id.
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [];
  }

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [];
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [];
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [];
  }
}
