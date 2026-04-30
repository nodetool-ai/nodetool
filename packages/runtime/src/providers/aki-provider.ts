import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

const AKI_BASE_URL = "https://aki.io/v1";

interface AkiProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

export class AkiProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["AKI_API_KEY"];
  }

  private _akiFetch: typeof fetch;

  constructor(
    secrets: { AKI_API_KEY?: string },
    options: AkiProviderOptions = {}
  ) {
    const apiKey = secrets.AKI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("AKI_API_KEY is not configured");
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
              baseURL: AKI_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "aki";
    this._akiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { AKI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._akiFetch(`${AKI_BASE_URL}/models`, {
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
        provider: "aki" as const
      }));
  }
}
