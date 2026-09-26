import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { trimTrailingSlashes } from "./openai-compat/index.js";
import type { ProviderCapability } from "./base-provider.js";
import type { ASRModel, EmbeddingModel, LanguageModel } from "./types.js";

interface VLLMProviderOptions extends OpenAICompatProviderOptions {
  baseURL?: string;
}

export class VLLMProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  private _vllmFetch: typeof fetch;
  private _vllmBaseURL: string;

  constructor(
    secrets: { VLLM_API_KEY?: string; VLLM_BASE_URL?: string } = {},
    options: VLLMProviderOptions = {}
  ) {
    const rawBaseURL =
      options.baseURL ??
      secrets.VLLM_BASE_URL ??
      process.env["VLLM_BASE_URL"];
    if (!rawBaseURL || !String(rawBaseURL).trim()) {
      throw new Error(
        "VLLM_BASE_URL is required (options.baseURL, secret, or env)"
      );
    }
    const baseURL = trimTrailingSlashes(String(rawBaseURL));

    const apiKey =
      secrets.VLLM_API_KEY && secrets.VLLM_API_KEY.trim().length > 0
        ? secrets.VLLM_API_KEY
        : "sk-no-key-required";
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { providerId: "vllm", apiKey, baseURL: `${baseURL}/v1` },
      { ...options, fetchFn }
    );

    this._vllmFetch = fetchFn;
    this._vllmBaseURL = baseURL;
  }

  override getContainerEnv() {
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

  /**
   * vLLM serves chat, embeddings (`/v1/embeddings`) and transcription
   * (`/v1/audio/transcriptions`). Declaring this set keeps the image, video
   * and speech capabilities inherited from {@link OpenAIProvider} off, since
   * vLLM has no endpoint for them.
   */
  protected override declaredCapabilities(): ProviderCapability[] {
    return [
      "generate_message",
      "generate_messages",
      "generate_embedding",
      "automatic_speech_recognition"
    ];
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const ids = await this.listServedModelIds();
    return ids.map((id) => ({ id, name: id, provider: "vllm" }));
  }

  /**
   * `/v1/models` does not report a model's task, so every served model is
   * offered as a candidate. The server rejects a call to an endpoint its
   * model does not support.
   */
  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    const ids = await this.listServedModelIds();
    return ids.map((id) => ({ id, name: id, provider: "vllm" }));
  }

  /** Same listing as {@link getAvailableEmbeddingModels}, for transcription. */
  override async getAvailableASRModels(): Promise<ASRModel[]> {
    const ids = await this.listServedModelIds();
    return ids.map((id) => ({ id, name: id, provider: "vllm" }));
  }

  private async listServedModelIds(): Promise<string[]> {
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
      // Stryker disable next-line ArrayDeclaration: the fallback is filtered downstream (rows need a string id), so [] vs any array is observably identical.
      const rows = payload.data ?? [];
      return rows
        .map((row) => row.id)
        .filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );
    } catch {
      return [];
    }
  }
}
