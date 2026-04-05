import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { EmbeddingModel, LanguageModel } from "./types.js";

interface MistralProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

export class MistralProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["MISTRAL_API_KEY"];
  }

  private _mistralFetch: typeof fetch;

  constructor(
    secrets: { MISTRAL_API_KEY?: string },
    options: MistralProviderOptions = {}
  ) {
    const apiKey = secrets.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: "https://api.mistral.ai/v1"
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "mistral";
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
    if (input.length === 0 || input.every((v) => !v)) {
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
