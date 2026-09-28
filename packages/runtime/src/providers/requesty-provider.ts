import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type CompatModelRow,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.requesty");

const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";

/** Listings merged by discovery, managed policies first. */
const REQUESTY_MODEL_LISTINGS = [
  `${REQUESTY_BASE_URL}/models/managed`,
  `${REQUESTY_BASE_URL}/models`
];

export class RequestyProvider extends OpenAICompatProvider {
  /** `supports_tool_calling` per model id, as reported by the last discovery. */
  private toolSupport = new Map<string, boolean>();
  private toolSupportLoad: Promise<unknown> | null = null;

  static override requiredSecrets(): string[] {
    return ["REQUESTY_API_KEY"];
  }

  constructor(
    secrets: { REQUESTY_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.REQUESTY_API_KEY;
    if (!apiKey) {
      throw new Error("REQUESTY_API_KEY is required");
    }

    super(
      {
        providerId: "requesty",
        apiKey,
        baseURL: REQUESTY_BASE_URL,
        // Attribution headers ride every chat request and the /models fetches.
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/nodetool-ai/nodetool-core",
          "X-Title": "NodeTool"
        }
      },
      options
    );
  }

  override getContainerEnv() {
    return { REQUESTY_API_KEY: this.apiKey };
  }

  /**
   * Requesty reports `supports_tool_calling` per model on both listings. Only
   * an explicit `false` disables native tools; a model the listings did not
   * describe keeps tools on. Discovery runs once per instance when no
   * listing has been seen yet.
   */
  override async hasToolSupport(model: string): Promise<boolean> {
    if (!this.toolSupport.has(model)) {
      this.toolSupportLoad ??= this.getAvailableLanguageModels();
      await this.toolSupportLoad;
    }
    return this.toolSupport.get(model) ?? true;
  }

  /**
   * Managed models (`/models/managed`, short ids such as `gpt-5.4-mini`) come
   * first, followed by the full `vendor/model` catalog from `/models`. Rows
   * whose `api` is not `"chat"` (embeddings and the like) are skipped. Each
   * listing fails on its own: a rejected fetch or a malformed body is logged
   * and contributes nothing, so the other listing still reaches the picker.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const results = await Promise.allSettled(
      REQUESTY_MODEL_LISTINGS.map((url) => this.fetchCompatModelRows(url))
    );
    const rows: CompatModelRow[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        rows.push(...result.value);
      } else {
        log.warn("Requesty model listing failed", {
          url: REQUESTY_MODEL_LISTINGS[i],
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
      if (row.api !== undefined && row.api !== "chat") continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      this.toolSupport.set(row.id, row.supports_tool_calling !== false);
      models.push({ id: row.id, name: row.id, provider: this.provider });
    }
    return models;
  }
}
