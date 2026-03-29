import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

interface TogetherProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

export class TogetherProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["TOGETHER_API_KEY"];
  }

  private _togetherFetch: typeof fetch;

  constructor(
    secrets: { TOGETHER_API_KEY?: string },
    options: TogetherProviderOptions = {}
  ) {
    const apiKey = secrets.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_API_KEY is required");
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
              baseURL: "https://api.together.xyz/v1",
            })),
        fetchFn,
      }
    );

    (this as { provider: string }).provider = "together";
    this._togetherFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { TOGETHER_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/models",
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string; type?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string; display_name?: string; type?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .filter((row) => {
        const t = row.type ?? "";
        return t === "chat" || t === "language" || t === "";
      })
      .map((row) => ({
        id: row.id,
        name: row.display_name ?? row.id,
        provider: "together",
      }));
  }
}
