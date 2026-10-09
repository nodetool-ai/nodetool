import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type CompatModelRow,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.opper");

const OPPER_BASE_URL = "https://api.opper.ai/v3/compat";

/** Listings merged by discovery, pools first. */
const OPPER_MODEL_LISTINGS = [
  `${OPPER_BASE_URL}/models?type=pool`,
  `${OPPER_BASE_URL}/models`
];

/** The `opper` block Opper adds to every `/models` row, or `{}`. */
function opperMetaOf(row: CompatModelRow): Record<string, unknown> {
  const meta = row.opper;
  return meta && typeof meta === "object"
    ? (meta as Record<string, unknown>)
    : {};
}

export class OpperProvider extends OpenAICompatProvider {
  /** Tool support per model id, as reported by the last discovery. */
  private toolSupport = new Map<string, boolean>();
  private toolSupportLoad: Promise<unknown> | null = null;

  static override requiredSecrets(): string[] {
    return ["OPPER_API_KEY"];
  }

  constructor(
    secrets: { OPPER_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.OPPER_API_KEY;
    if (!apiKey) {
      throw new Error("OPPER_API_KEY is required");
    }

    super(
      {
        providerId: "opper",
        apiKey,
        baseURL: OPPER_BASE_URL
      },
      options
    );
  }

  override getContainerEnv() {
    return { OPPER_API_KEY: this.apiKey };
  }

  /**
   * Opper lists each model's `opper.capabilities` on both listings. Only a
   * listed model whose capabilities lack `tools` disables native tools; a
   * model the listings did not describe keeps tools on. Discovery runs once
   * per instance when no listing has been seen yet.
   */
  override async hasToolSupport(model: string): Promise<boolean> {
    if (!this.toolSupport.has(model)) {
      this.toolSupportLoad ??= this.getAvailableLanguageModels();
      await this.toolSupportLoad;
    }
    return this.toolSupport.get(model) ?? true;
  }

  /**
   * Pools (`/models?type=pool`, bare ids such as `claude-sonnet-4-6` that
   * Opper routes across providers) come first, followed by the full catalog
   * from `/models`, which adds `provider/model` ids that pin one route. Rows
   * whose `opper.type` is not `"llm"` (embeddings) are skipped. Each listing
   * fails on its own: a rejected fetch or a malformed body is logged and
   * contributes nothing, so the other listing still reaches the picker.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const results = await Promise.allSettled(
      OPPER_MODEL_LISTINGS.map((url) => this.fetchCompatModelRows(url))
    );
    const rows: CompatModelRow[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        rows.push(...result.value);
      } else {
        log.warn("Opper model listing failed", {
          url: OPPER_MODEL_LISTINGS[i],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
        });
      }
    });

    const seen = new Set<string>();
    const models: LanguageModel[] = [];
    for (const row of rows) {
      const meta = opperMetaOf(row);
      if (meta.type !== undefined && meta.type !== "llm") continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      this.toolSupport.set(
        row.id,
        !Array.isArray(meta.capabilities) || meta.capabilities.includes("tools")
      );
      models.push({ id: row.id, name: row.id, provider: this.provider });
    }
    return models;
  }
}
