import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

const EVOLINK_BASE_URL = "https://direct.evolink.ai/v1";

interface EvolinkProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * Evolink provider. Uses the OpenAI SDK against Evolink's
 * OpenAI-compatible gateway at https://direct.evolink.ai/v1, which fronts
 * GPT, Claude, Gemini, DeepSeek and other models behind a single API key.
 */
export class EvolinkProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["EVOLINK_API_KEY"];
  }

  private _evolinkFetch: typeof fetch;

  constructor(
    secrets: { EVOLINK_API_KEY?: string },
    options: EvolinkProviderOptions = {}
  ) {
    const apiKey = secrets.EVOLINK_API_KEY;
    if (!apiKey) {
      throw new Error("EVOLINK_API_KEY is required");
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
              baseURL: EVOLINK_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "evolink";
    this._evolinkFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { EVOLINK_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._evolinkFetch(
      `${EVOLINK_BASE_URL}/models`,
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
        provider: "evolink"
      }));
  }
}
