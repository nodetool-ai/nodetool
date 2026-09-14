import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { ChatCompletionsRequest } from "./openai-compat/index.js";
import {
  annotateGroqRequestFailure,
  estimateGroqRequestTokens,
  groqContextExceeded,
  groqRequestFailureDiagnostic
} from "./groq-request.js";
import type { LanguageModel } from "./types.js";

export class GroqProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["GROQ_API_KEY"];
  }

  constructor(
    secrets: { GROQ_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is required");
    }

    super(
      {
        providerId: "groq",
        apiKey,
        baseURL: "https://api.groq.com/openai/v1"
      },
      options
    );
  }

  override getContainerEnv() {
    return { GROQ_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  protected override handleCompatError(
    error: unknown,
    request: ChatCompletionsRequest
  ): unknown {
    const estimate = estimateGroqRequestTokens(request);
    const diagnostic = groqRequestFailureDiagnostic(error, estimate);
    return diagnostic
      ? annotateGroqRequestFailure(error, diagnostic)
      : error;
  }

  override isContextExceededError(error: unknown): boolean {
    return groqContextExceeded(error);
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
