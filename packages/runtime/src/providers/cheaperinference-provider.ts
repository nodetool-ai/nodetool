import { createLogger } from "@nodetool-ai/config";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

const log = createLogger("nodetool.runtime.providers.cheaperinference");

const CHEAPER_INFERENCE_BASE_URL = "https://api.cheaperinference.com/v1";

export class CheaperInferenceProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return ["CHEAPER_INFERENCE_API_KEY"];
  }

  constructor(
    secrets: { CHEAPER_INFERENCE_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.CHEAPER_INFERENCE_API_KEY;
    if (!apiKey) {
      throw new Error("CHEAPER_INFERENCE_API_KEY is required");
    }

    super(
      {
        providerId: "cheaperinference",
        apiKey,
        baseURL: CHEAPER_INFERENCE_BASE_URL
      },
      options
    );
  }

  override getContainerEnv() {
    return { CHEAPER_INFERENCE_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  /**
   * The catalog comes from `/models` in the OpenAI `{ data: [{ id }] }` shape.
   * Only rows whose `type` is `"text"` are kept, which drops the image and
   * video rows and any row without a type. Duplicate ids are dropped. Any
   * fetch failure answers `[]`, so one bad key does not break the other
   * providers in the picker.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const rows = await this.fetchCompatModelRows();
      const seen = new Set<string>();
      const models: LanguageModel[] = [];
      for (const row of rows) {
        if (row.type !== "text") continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        models.push({ id: row.id, name: row.id, provider: this.provider });
      }
      return models;
    } catch (error) {
      log.warn("Cheaper Inference model discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}
