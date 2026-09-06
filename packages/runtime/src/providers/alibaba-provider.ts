import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { trimTrailingSlashes } from "./openai-compat/index.js";
import type { ChatCompletionsRequest } from "./openai-compat/types.js";
import { PROVIDER_IDS, type LanguageModel } from "./types.js";

export const ALIBABA_DEFAULT_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/**
 * Resolve the DashScope base URL for the key's region. Precedence: explicit
 * override (the stored `DASHSCOPE_BASE_URL` setting) > `DASHSCOPE_BASE_URL`
 * env var > the international (Singapore) default. Shared with
 * `credential-check.ts` so key verification probes the same endpoint the
 * provider talks to.
 */
export function resolveAlibabaBaseURL(override?: string): string {
  const raw =
    override || process.env["DASHSCOPE_BASE_URL"] || ALIBABA_DEFAULT_BASE_URL;
  return trimTrailingSlashes(raw);
}

/**
 * Model families served through the OpenAI-compatible endpoint that Alibaba's
 * function-calling documentation excludes — sending `tools` to them answers
 * 400 "The tool call is not supported".
 * See https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling.
 */
const NO_TOOL_SUPPORT_PREFIXES = [
  "qwen-math",
  "qwen2-math",
  "qwen2.5-math",
  "qvq",
  "qwen-vl-ocr",
  "qwen-mt",
  "qwen-audio",
  "qwen2-audio",
  "qwen-tts",
  "text-embedding"
];

/**
 * Alibaba Cloud Model Studio provider. Speaks the OpenAI Chat Completions
 * dialect against DashScope's OpenAI-compatible endpoint, which serves the
 * Qwen model family behind a single API key.
 *
 * Model Studio keys are region-scoped: the default base URL is the
 * international (Singapore) endpoint, and a key created in another region
 * (Beijing, Frankfurt, Virginia, Tokyo, Hong Kong) needs `DASHSCOPE_BASE_URL`
 * pointed at that region's `/compatible-mode/v1` endpoint.
 * See https://modelstudio.console.alibabacloud.com/.
 */
export class AlibabaProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["DASHSCOPE_API_KEY"];
  }

  constructor(
    secrets: { DASHSCOPE_API_KEY?: string; DASHSCOPE_BASE_URL?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is required");
    }

    // Precedence mirrors LMStudioProvider: resolved settings (secret store,
    // then env) arrive as `secrets`, so honoring `secrets.DASHSCOPE_BASE_URL`
    // is what lets users point the provider at their key's region.
    const baseURL = resolveAlibabaBaseURL(secrets.DASHSCOPE_BASE_URL);

    super({ providerId: PROVIDER_IDS.ALIBABA, apiKey, baseURL }, options);
  }

  override getContainerEnv() {
    const env: Record<string, string> = { DASHSCOPE_API_KEY: this.apiKey };
    if (this.compatBaseURL !== ALIBABA_DEFAULT_BASE_URL) {
      env["DASHSCOPE_BASE_URL"] = this.compatBaseURL;
    }
    return env;
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    const id = model.toLowerCase();
    return !NO_TOOL_SUPPORT_PREFIXES.some((prefix) => id.startsWith(prefix));
  }

  /**
   * DashScope documents `max_completion_tokens` only for the newest Qwen
   * releases; every chat model accepts `max_tokens`, so send that instead.
   */
  protected override transformChatRequest(
    request: ChatCompletionsRequest
  ): ChatCompletionsRequest {
    const { max_completion_tokens, ...rest } = request;
    if (max_completion_tokens === undefined) {
      return request;
    }
    return { ...rest, max_tokens: max_completion_tokens };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
