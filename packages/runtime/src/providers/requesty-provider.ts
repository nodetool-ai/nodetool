import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

const REQUESTY_BASE_URL = "https://router.requesty.ai/v1";

export class RequestyProvider extends OpenAICompatProvider {
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

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /**
   * Managed models (`/models/managed`, short ids such as `gpt-5.4-mini`) come
   * first, followed by the full `vendor/model` catalog from `/models`. Rows
   * whose `api` is not `"chat"` (embeddings and the like) are skipped, and a
   * failed listing contributes nothing.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const [managed, catalog] = await Promise.all([
      this.fetchCompatModelRows(`${REQUESTY_BASE_URL}/models/managed`),
      this.fetchCompatModelRows(`${REQUESTY_BASE_URL}/models`)
    ]);
    const seen = new Set<string>();
    const models: LanguageModel[] = [];
    for (const row of [...managed, ...catalog]) {
      if (row.api !== undefined && row.api !== "chat") continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      models.push({ id: row.id, name: row.id, provider: this.provider });
    }
    return models;
  }
}
