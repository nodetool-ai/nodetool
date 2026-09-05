import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

export class CerebrasProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["CEREBRAS_API_KEY"];
  }

  constructor(
    secrets: { CEREBRAS_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error("CEREBRAS_API_KEY is required");
    }

    super(
      {
        providerId: "cerebras",
        apiKey,
        baseURL: "https://api.cerebras.ai/v1"
      },
      options
    );
  }

  override getContainerEnv() {
    return { CEREBRAS_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
