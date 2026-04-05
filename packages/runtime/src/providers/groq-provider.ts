import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

interface GroqProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

export class GroqProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["GROQ_API_KEY"];
  }

  private _groqFetch: typeof fetch;

  constructor(
    secrets: { GROQ_API_KEY?: string },
    options: GroqProviderOptions = {}
  ) {
    const apiKey = secrets.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is required");
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
              baseURL: "https://api.groq.com/openai/v1"
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "groq";
    this._groqFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { GROQ_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._groqFetch(
      "https://api.groq.com/openai/v1/models",
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
        provider: "groq"
      }));
  }
}
