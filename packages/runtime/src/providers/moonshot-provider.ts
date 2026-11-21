import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { PROVIDER_IDS, type LanguageModel } from "./types.js";

/**
 * `KIMI_REGION` → OpenAI-compatible API root. International:
 * https://platform.kimi.ai/docs/api/overview.md. Mainland China (the
 * platform.moonshot.cn console, now served at platform.kimi.com):
 * https://platform.kimi.com/docs/api/chat.md, whose OpenAPI `servers` entry is
 * https://api.moonshot.cn. Keys are not shared between the two platforms.
 */
export const KIMI_BASE_URLS = {
  international: "https://api.moonshot.ai/v1",
  china: "https://api.moonshot.cn/v1"
} as const;

/** `KIMI_REGION` → API root. Empty or unknown values use the international host. */
export function resolveKimiBaseURL(region?: string | null): string {
  const key = (region ?? "").trim().toLowerCase();
  return key === "china" ? KIMI_BASE_URLS.china : KIMI_BASE_URLS.international;
}

/**
 * Moonshot AI (Kimi) provider. Speaks the OpenAI Chat Completions dialect
 * against Moonshot's OpenAI-compatible endpoint, on the host `KIMI_REGION`
 * selects. Covers the Kimi K2 model family.
 */
export class MoonshotProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["KIMI_API_KEY"];
  }

  private _moonshotFetch: typeof fetch;
  private readonly _moonshotBaseURL: string;

  constructor(
    secrets: { KIMI_API_KEY?: string; KIMI_REGION?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.KIMI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("KIMI_API_KEY is not configured");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    const baseURL = resolveKimiBaseURL(secrets.KIMI_REGION);

    super(
      {
        providerId: PROVIDER_IDS.MOONSHOT,
        apiKey: apiKey.trim(),
        baseURL
      },
      { ...options, fetchFn }
    );

    this._moonshotFetch = fetchFn;
    this._moonshotBaseURL = baseURL;
  }

  override getContainerEnv() {
    return { KIMI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._moonshotFetch(`${this._moonshotBaseURL}/models`, {
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
