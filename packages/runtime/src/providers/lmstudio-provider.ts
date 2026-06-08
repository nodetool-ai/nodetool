import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import { LMSTUDIO_DEFAULT_URL } from "./defaults.js";
import type { LanguageModel } from "./types.js";

interface LMStudioProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
  baseURL?: string;
}

export class LMStudioProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  private _lmstudioFetch: typeof fetch;
  private _lmstudioBaseURL: string;

  constructor(
    secrets: { LMSTUDIO_API_KEY?: string; LMSTUDIO_API_URL?: string } = {},
    options: LMStudioProviderOptions = {}
  ) {
    // Precedence: explicit options.baseURL > secret/env LMSTUDIO_API_URL > default.
    // The provider registry passes resolved settings (secret store, then env) as
    // the `secrets` arg, so honoring `secrets.LMSTUDIO_API_URL` is what lets
    // users override the port via API Keys / settings.
    const rawBaseURL =
      options.baseURL ??
      secrets.LMSTUDIO_API_URL ??
      process.env["LMSTUDIO_API_URL"] ??
      LMSTUDIO_DEFAULT_URL;
    const baseURL = rawBaseURL.replace(/\/+$/, "");
    const apiKey = secrets.LMSTUDIO_API_KEY ?? "lm-studio";
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

    (this as { provider: string }).provider = "lmstudio";
    this._lmstudioFetch = fetchFn;
    this._lmstudioBaseURL = baseURL;
  }

  override getContainerEnv(): Record<string, string> {
    const env: Record<string, string> = {
      LMSTUDIO_API_URL: this._lmstudioBaseURL
    };
    if (this.apiKey && this.apiKey !== "lm-studio") {
      env.LMSTUDIO_API_KEY = this.apiKey;
    }
    return env;
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const response = await this._lmstudioFetch(
        `${this._lmstudioBaseURL}/v1/models`,
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
        data?: Array<{ id?: string }>;
      };
      // Stryker disable next-line ArrayDeclaration: the fallback is filtered downstream (rows need a string id), so [] vs any array is observably identical.
    const rows = payload.data ?? [];
      return rows
        .filter(
          (row): row is { id: string } =>
            typeof row.id === "string" && row.id.length > 0
        )
        .map((row) => ({
          id: row.id,
          name: row.id,
          provider: "lmstudio"
        }));
    } catch {
      return [];
    }
  }
}
