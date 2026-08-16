import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import {
  PROVIDER_IDS,
  type ASRModel,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
  type TTSModel,
  type VideoModel
} from "./types.js";

const META_BASE_URL = "https://api.meta.ai/v1";

/**
 * Models Meta serves when `/v1/models` cannot be reached (no network, key not
 * yet accepted). Keeps the model menu usable so a user can pick one and let
 * the call itself report the real error. See https://dev.meta.ai/docs/models.
 */
const META_FALLBACK_MODELS = [
  "muse-spark-1.2",
  "muse-spark-1.2-contributor",
  "muse-spark-1.1"
] as const;

/**
 * Meta AI provider. Speaks the OpenAI Chat Completions dialect against Meta's
 * model API at https://api.meta.ai/v1, which serves the Muse Spark family:
 * multimodal input (text, image, video, PDF), text output, parallel tool
 * calling, and a 1M-token context window.
 * See https://dev.meta.ai/docs/overview.
 */
export class MetaProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["META_API_KEY"];
  }

  private _metaFetch: typeof fetch;

  constructor(
    secrets: { META_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.META_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("META_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: PROVIDER_IDS.META,
        apiKey: apiKey.trim(),
        baseURL: META_BASE_URL
      },
      { ...options, fetchFn }
    );

    this._metaFetch = fetchFn;
  }

  override getContainerEnv() {
    return { META_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._metaFetch(`${META_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      return this.fallbackLanguageModels();
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const rows = payload.data ?? [];
    const models = rows
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: PROVIDER_IDS.META
      }));

    return models.length > 0 ? models : this.fallbackLanguageModels();
  }

  private fallbackLanguageModels(): LanguageModel[] {
    return META_FALLBACK_MODELS.map((id) => ({
      id,
      name: id,
      provider: PROVIDER_IDS.META
    }));
  }

  // Meta's API generates text only; suppress the OpenAI media/embedding
  // defaults so they don't surface under the meta id.
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
