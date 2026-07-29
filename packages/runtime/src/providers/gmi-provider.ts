import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
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

/**
 * GMI Cloud provider. Speaks the OpenAI Chat Completions dialect against GMI
 * Cloud's OpenAI-compatible inference gateway at
 * https://api.gmi-serving.com/v1, which serves open-weight chat models (Llama,
 * DeepSeek, Qwen, …) behind a single API key.
 * See https://docs.gmicloud.ai/quickstart.
 */
export class GMIProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["GMI_API_KEY"];
  }

  private _gmiFetch: typeof fetch;

  constructor(
    secrets: { GMI_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.GMI_API_KEY;
    if (!apiKey) {
      throw new Error("GMI_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { providerId: "gmi", apiKey, baseURL: GMI_BASE_URL },
      { ...options, fetchFn }
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
