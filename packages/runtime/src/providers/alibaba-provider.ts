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

const ALIBABA_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Alibaba Cloud Model Studio provider. Speaks the OpenAI Chat Completions
 * dialect against DashScope's OpenAI-compatible endpoint at
 * https://dashscope-intl.aliyuncs.com/compatible-mode/v1, which serves the Qwen
 * model family behind a single API key.
 * See https://modelstudio.console.alibabacloud.com/.
 */
export class AlibabaProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["DASHSCOPE_API_KEY"];
  }

  private _alibabaFetch: typeof fetch;

  constructor(
    secrets: { DASHSCOPE_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: PROVIDER_IDS.ALIBABA,
        apiKey,
        baseURL: ALIBABA_BASE_URL
      },
      { ...options, fetchFn }
    );

    this._alibabaFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { DASHSCOPE_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._alibabaFetch(`${ALIBABA_BASE_URL}/models`, {
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
        provider: PROVIDER_IDS.ALIBABA
      }));
  }

  // Model Studio's OpenAI-compatible endpoint exposes chat models only;
  // suppress the OpenAI media/embedding defaults so they don't surface under
  // the alibaba id.
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
