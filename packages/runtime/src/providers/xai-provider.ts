import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

interface XAIProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * xAI (Grok) provider. Uses the OpenAI SDK against xAI's
 * OpenAI-compatible endpoint at https://api.x.ai/v1.
 */
export class XAIProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["XAI_API_KEY"];
  }

  private _xaiFetch: typeof fetch;

  constructor(
    secrets: { XAI_API_KEY?: string },
    options: XAIProviderOptions = {}
  ) {
    const apiKey = secrets.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is required");
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
              baseURL: XAI_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "xai";
    this._xaiFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { XAI_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._xaiFetch(`${XAI_BASE_URL}/models`, {
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
        provider: "xai"
      }));
  }
}
