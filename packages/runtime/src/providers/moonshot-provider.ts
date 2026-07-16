import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { PROVIDER_IDS, type LanguageModel } from "./types.js";

const MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1";

/**
 * Moonshot AI (Kimi) provider. Speaks the OpenAI Chat Completions dialect
 * against Moonshot's OpenAI-compatible endpoint at https://api.moonshot.ai/v1.
 * Covers the Kimi K2 model family.
 */
export class MoonshotProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["KIMI_API_KEY"];
  }

  private _moonshotFetch: typeof fetch;

  constructor(
    secrets: { KIMI_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.KIMI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("KIMI_API_KEY is not configured");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: PROVIDER_IDS.MOONSHOT,
        apiKey: apiKey.trim(),
        baseURL: MOONSHOT_BASE_URL
      },
      { ...options, fetchFn }
    );

    this._moonshotFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { KIMI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._moonshotFetch(`${MOONSHOT_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.id,
        provider: PROVIDER_IDS.MOONSHOT
      }));
  }
}
