import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import type { LanguageModel } from "./types.js";

interface VLLMProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
  baseURL?: string;
}

export class VLLMProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  private _vllmFetch: typeof fetch;
  private _vllmBaseURL: string;

  constructor(
    secrets: { VLLM_API_KEY?: string } = {},
    options: VLLMProviderOptions = {}
  ) {
    const baseURL = options.baseURL;
    if (!baseURL) {
      throw new Error("VLLM_BASE_URL is required (pass via options.baseURL)");
    }

    const apiKey = secrets.VLLM_API_KEY ?? "sk-no-key-required";
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
              baseURL: `${baseURL}/v1`
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "vllm";
    this._vllmFetch = fetchFn;
    this._vllmBaseURL = baseURL;
  }

  override getContainerEnv(): Record<string, string> {
    const env: Record<string, string> = {
      VLLM_BASE_URL: this._vllmBaseURL
    };
    if (this.apiKey && this.apiKey !== "sk-no-key-required") {
      env.VLLM_API_KEY = this.apiKey;
    }
    return env;
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const response = await this._vllmFetch(`${this._vllmBaseURL}/v1/models`, {
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
          provider: "vllm"
        }));
    } catch {
      return [];
    }
  }
}
