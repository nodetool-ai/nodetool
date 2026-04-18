import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic-provider.js";
import type { LanguageModel } from "./types.js";

const MOONSHOT_BASE_URL = "https://api.kimi.com/coding";

interface MoonshotProviderOptions {
  client?: Anthropic;
  clientFactory?: (apiKey: string) => Anthropic;
  fetchFn?: typeof fetch;
}

/**
 * Moonshot AI (Kimi) provider. Uses the Anthropic SDK against Moonshot's
 * Claude-compatible endpoint exposed to Kimi coding plan subscribers at
 * https://api.kimi.com/coding.
 */
export class MoonshotProvider extends AnthropicProvider {
  static override requiredSecrets(): string[] {
    return ["MOONSHOT_API_KEY"];
  }

  constructor(
    secrets: { MOONSHOT_API_KEY?: string },
    options: MoonshotProviderOptions = {}
  ) {
    const apiKey = secrets.MOONSHOT_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("MOONSHOT_API_KEY is not configured");
    }

    super(
      { ANTHROPIC_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new Anthropic({
              apiKey: key,
              baseURL: MOONSHOT_BASE_URL
            })),
        fetchFn: options.fetchFn
      }
    );

    (this as { provider: string }).provider = "moonshot";
  }

  override getContainerEnv(): Record<string, string> {
    return {
      MOONSHOT_API_KEY: this.apiKey,
      ANTHROPIC_BASE_URL: MOONSHOT_BASE_URL
    };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const knownModels = [
      "kimi-k2-turbo-preview",
      "kimi-k2-0905-preview",
      "kimi-k2-0711-preview"
    ];
    return knownModels.map((id) => ({ id, name: id, provider: "moonshot" }));
  }
}
