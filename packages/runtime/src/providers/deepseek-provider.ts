import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

interface DeepSeekProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * DeepSeek provider. Uses the OpenAI SDK against DeepSeek's
 * OpenAI-compatible endpoint at https://api.deepseek.com/v1.
 * Covers DeepSeek-V3 chat and DeepSeek-R1 reasoning models.
 */
export class DeepSeekProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["DEEPSEEK_API_KEY"];
  }

  private _deepseekFetch: typeof fetch;

  constructor(
    secrets: { DEEPSEEK_API_KEY?: string },
    options: DeepSeekProviderOptions = {}
  ) {
    const apiKey = secrets.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required");
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
              baseURL: DEEPSEEK_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "deepseek";
    this._deepseekFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { DEEPSEEK_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._deepseekFetch(
      `${DEEPSEEK_BASE_URL}/models`,
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
        provider: "deepseek"
      }));
  }
}
