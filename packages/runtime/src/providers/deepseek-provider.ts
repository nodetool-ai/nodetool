import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

/**
 * DeepSeek provider. Speaks the OpenAI Chat Completions dialect against
 * DeepSeek's OpenAI-compatible endpoint at https://api.deepseek.com/v1.
 * Covers DeepSeek-V3 chat and DeepSeek-R1 reasoning models.
 */
export class DeepSeekProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["DEEPSEEK_API_KEY"];
  }

  constructor(
    secrets: { DEEPSEEK_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required");
    }

    super(
      { providerId: "deepseek", apiKey, baseURL: DEEPSEEK_BASE_URL },
      options
    );
  }

  override getContainerEnv() {
    return { DEEPSEEK_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
