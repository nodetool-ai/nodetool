import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { PROVIDER_IDS, type LanguageModel } from "./types.js";

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

  constructor(
    secrets: { META_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.META_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("META_API_KEY is required");
    }

    super(
      {
        providerId: PROVIDER_IDS.META,
        apiKey: apiKey.trim(),
        baseURL: META_BASE_URL
      },
      options
    );
  }

  override getContainerEnv() {
    return { META_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const models = await this.listCompatModels();
    return models.length > 0 ? models : this.fallbackLanguageModels();
  }

  private fallbackLanguageModels(): LanguageModel[] {
    return META_FALLBACK_MODELS.map((id) => ({
      id,
      name: id,
      provider: PROVIDER_IDS.META
    }));
  }
}
