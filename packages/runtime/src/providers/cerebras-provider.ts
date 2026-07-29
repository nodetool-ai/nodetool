import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

export class CerebrasProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["CEREBRAS_API_KEY"];
  }

  private _cerebrasFetch: typeof fetch;

  constructor(
    secrets: { CEREBRAS_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error("CEREBRAS_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: "cerebras",
        apiKey,
        baseURL: "https://api.cerebras.ai/v1"
      },
      { ...options, fetchFn }
    );

    this._cerebrasFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { CEREBRAS_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._cerebrasFetch(
      "https://api.cerebras.ai/v1/models",
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
        provider: "cerebras"
      }));
  }
}
