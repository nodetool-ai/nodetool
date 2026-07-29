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

  private _deepseekFetch: typeof fetch;

  constructor(
    secrets: { DEEPSEEK_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { providerId: "deepseek", apiKey, baseURL: DEEPSEEK_BASE_URL },
      { ...options, fetchFn }
    );

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
        provider: "deepseek"
      }));
  }
}
