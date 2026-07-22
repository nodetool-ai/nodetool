import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { trimTrailingSlashes } from "./openai-compat/index.js";
import type { LanguageModel } from "./types.js";

interface LlamaProviderOptions extends OpenAICompatProviderOptions {
  baseURL?: string;
}

/**
 * HTTP client for a remote `llama-server` (llama.cpp's OpenAI-compatible
 * server). It speaks the same dialect as vLLM and LM Studio, so it rides the
 * shared {@link OpenAICompatProvider} chat path rather than hand-rolling one:
 * that supplies native tool calling, sampling parameters, usage tracking and a
 * terminal chunk on every finish reason.
 *
 * For running GGUF models in-process instead, see `NodeLlamaCppProvider`.
 */
export class LlamaProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["LLAMA_CPP_URL"];
  }

  readonly baseUrl: string;
  private readonly _llamaFetch: typeof fetch;

  constructor(
    secrets: { LLAMA_CPP_URL?: string },
    options: LlamaProviderOptions = {}
  ) {
    const raw =
      options.baseURL ?? secrets.LLAMA_CPP_URL ?? process.env.LLAMA_CPP_URL;
    if (!raw || !String(raw).trim()) {
      throw new Error("LLAMA_CPP_URL is required");
    }
    const baseURL = trimTrailingSlashes(String(raw));
    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: "llama_cpp",
        apiKey: "sk-no-key-required",
        baseURL: `${baseURL}/v1`
      },
      { ...options, fetchFn }
    );

    this.baseUrl = baseURL;
    this._llamaFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return {};
  }

  /**
   * llama-server constrains generation with a grammar built from the tool
   * schemas, so tool calling is native for any model it serves — no
   * prompt-level emulation.
   */
  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const response = await this._llamaFetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) return [];
      // llama-server answers with `data`; some builds and proxies use `models`.
      const payload = (await response.json()) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string }>;
      };
      const rows = payload.data ?? payload.models ?? [];
      return rows
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .map((id) => ({ id, name: id, provider: "llama_cpp" }));
    } catch {
      return [];
    }
  }

  override isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("context window") ||
      msg.includes("token limit") ||
      msg.includes("request too large") ||
      msg.includes("413")
    );
  }
}
