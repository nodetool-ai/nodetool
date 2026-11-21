import { createLogger } from "@nodetool-ai/config";
import { isString } from "@nodetool-ai/protocol";
import {
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { DiscoveredCompatProvider } from "./discovered-compat-provider.js";
import type { LanguageModel } from "./types.js";
import { classifyListedModel } from "./custom-model-kinds.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.standardcompute");

const STANDARD_COMPUTE_BASE_URL = "https://api.stdcmpt.com/v1";

/**
 * Standard Compute is an OpenAI-compatible gateway. Its `/models` listing
 * starts with the routed `StandardCompute` model, which sends each request to
 * the cheapest enabled model that can handle it, and then lists the models a
 * request can pin. Rows carry `display_name`, `context_length`,
 * `supported_parameters` and, for pinned models, `architecture` modalities.
 */
export class StandardComputeProvider extends DiscoveredCompatProvider {
  static override requiredSecrets(): string[] {
    return ["STANDARDCOMPUTE_API_KEY"];
  }

  constructor(
    secrets: { STANDARDCOMPUTE_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.STANDARDCOMPUTE_API_KEY;
    if (!apiKey) throw new Error("STANDARDCOMPUTE_API_KEY is required");
    super(
      {
        providerId: "standardcompute",
        apiKey,
        baseURL: STANDARD_COMPUTE_BASE_URL
      },
      options
    );
  }

  override getContainerEnv(): Record<string, string> {
    return { STANDARDCOMPUTE_API_KEY: this.apiKey };
  }

  /**
   * Keep the chat models. The shared classifier reads
   * `architecture.output_modalities` when a row has it and judges the rest by
   * id, so the routed `StandardCompute` row stays in the list. Duplicate ids
   * are dropped. Any fetch failure answers `[]`.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const rows = await this.fetchCompatModelRows();
      const seen = new Set<string>();
      const models: LanguageModel[] = [];
      for (const row of rows) {
        if (classifyListedModel(row).kind !== "language") continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const params = row.supported_parameters;
        this.toolSupport.set(
          row.id,
          Array.isArray(params) ? params.includes("tools") : true
        );
        if (typeof row.context_length === "number" && row.context_length > 0) {
          this.contextWindows.set(row.id, row.context_length);
        }
        models.push({
          id: row.id,
          name:
            isString(row.display_name) && row.display_name !== ""
              ? row.display_name
              : row.id,
          provider: this.provider
        });
      }
      return models;
    } catch (error) {
      log.warn("Standard Compute model discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}
