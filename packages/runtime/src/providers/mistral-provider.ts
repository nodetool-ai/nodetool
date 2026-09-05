import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { EmbeddingModel, LanguageModel } from "./types.js";

export class MistralProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["MISTRAL_API_KEY"];
  }

  constructor(
    secrets: { MISTRAL_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is required");
    }

    super(
      {
        providerId: "mistral",
        apiKey,
        baseURL: "https://api.mistral.ai/v1"
      },
      options
    );
  }

  override getContainerEnv() {
    return { MISTRAL_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [
      {
        id: "mistral-embed",
        name: "Mistral Embed",
        provider: "mistral",
        dimensions: 1024
      }
    ];
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const input = Array.isArray(args.text) ? args.text : [args.text];
    // `[].every(...)` is vacuously true, so this also rejects an empty array.
    if (input.every((v) => !v)) {
      throw new Error("text must not be empty");
    }

    const model = args.model || "mistral-embed";
    const response = await this.getClient().embeddings.create({
      model,
      input
    });

    return response.data.map((row) => row.embedding);
  }
}
