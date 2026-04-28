/**
 * Model listing tool — T-AG-3.
 *
 * Lists available language models from a registered provider.
 */
import type { ProcessingContext, BaseProvider } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

export class ListProviderModelsTool extends Tool {
  readonly name = "list_provider_models";
  readonly description = "List available language models from a provider.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      provider: {
        type: "string" as const,
        description: "Provider ID (e.g. 'openai', 'anthropic')"
      }
    },
    required: ["provider"]
  };

  private providers: Record<string, BaseProvider>;

  constructor(providers: Record<string, BaseProvider>) {
    super();
    this.providers = providers;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const providerId = params.provider;
    if (typeof providerId !== "string") {
      return { success: false, error: "provider must be a string" };
    }

    const provider = this.providers[providerId];
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (
      typeof (provider as unknown as Record<string, unknown>)
        .getAvailableLanguageModels !== "function"
    ) {
      return {
        success: false,
        error: `Provider ${providerId} does not support model listing`
      };
    }

    try {
      const models = await provider.getAvailableLanguageModels();
      return { success: true, provider: providerId, models };
    } catch (e) {
      return {
        success: false,
        error: `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
}
