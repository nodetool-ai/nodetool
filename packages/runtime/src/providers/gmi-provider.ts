import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

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

  constructor(
    secrets: { GMI_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.GMI_API_KEY;
    if (!apiKey) {
      throw new Error("GMI_API_KEY is required");
    }

    super({ providerId: "gmi", apiKey, baseURL: GMI_BASE_URL }, options);
  }

  override getContainerEnv() {
    return { GMI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
