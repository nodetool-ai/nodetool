import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { EmbeddingModel, LanguageModel } from "./types.js";

export class MistralProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["MISTRAL_API_KEY"];
  }

  private _mistralFetch: typeof fetch;

  constructor(
    secrets: { MISTRAL_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: "mistral",
        apiKey,
        baseURL: "https://api.mistral.ai/v1"
      },
      { ...options, fetchFn }
    );

    this._mistralFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { MISTRAL_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._mistralFetch(
      "https://api.mistral.ai/v1/models",
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    // Stryker disable next-line ArrayDeclaration: the fallback is filtered downstream (rows need a string id), so [] vs any array is observably identical.
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        provider: "mistral"
      }));
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

    return response.data.map((row) => row.embedding as number[]);
  }
}
