import { createLogger } from "@nodetool-ai/config";
import { isString } from "@nodetool-ai/protocol";
import {
  OpenAICompatProvider,
  type CompatModelRow,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";
import { classifyListedModel } from "./custom-model-kinds.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.runcrate");

const RUNCRATE_BASE_URL = "https://api.runcrate.ai/v1";

/** A row's modality list (`input_modalities` / `output_modalities`), or null. */
function modalitiesOf(row: CompatModelRow, field: string): string[] | null {
  const value = row[field];
  return Array.isArray(value) ? value.filter(isString) : null;
}

/**
 * Runcrate serves open-weight chat, embedding, image, video and speech models
 * from one OpenAI-compatible endpoint. Its `/models` rows carry
 * `input_modalities`, `output_modalities`, `supported_features` and
 * `context_length`, so discovery keeps the text-in, text-out models and
 * remembers each one's tool support and context window.
 */
export class RuncrateProvider extends OpenAICompatProvider {
  /** `supported_features` includes `"tools"`, per model id, from the last discovery. */
  private toolSupport = new Map<string, boolean>();
  /** `context_length` per model id, from the last discovery. */
  private contextWindows = new Map<string, number>();
  private discoveryLoad: Promise<unknown> | null = null;

  static override requiredSecrets(): string[] {
    return ["RUNCRATE_API_KEY"];
  }

  constructor(
    secrets: { RUNCRATE_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.RUNCRATE_API_KEY;
    if (!apiKey) throw new Error("RUNCRATE_API_KEY is required");
    super(
      { providerId: "runcrate", apiKey, baseURL: RUNCRATE_BASE_URL },
      options
    );
  }

  override getContainerEnv(): Record<string, string> {
    return { RUNCRATE_API_KEY: this.apiKey };
  }

  /** Runs discovery once per instance when the model was not listed yet. */
  private async ensureDiscovered(model: string): Promise<void> {
    if (this.toolSupport.has(model)) return;
    this.discoveryLoad ??= this.getAvailableLanguageModels();
    await this.discoveryLoad;
  }

  /**
   * A row whose `supported_features` omits `"tools"` turns native tools off;
   * a model the listing did not describe keeps them on.
   */
  override async hasToolSupport(model: string): Promise<boolean> {
    await this.ensureDiscovered(model);
    return this.toolSupport.get(model) ?? true;
  }

  /** The `context_length` the listing reports, or null for an unlisted model. */
  override async getContextWindow(model: string): Promise<number | null> {
    await this.ensureDiscovered(model);
    return this.contextWindows.get(model) ?? null;
  }

  /**
   * Keep the chat models: rows that take and produce text. Embedding, image,
   * video, text-to-speech and speech-to-text rows are skipped by their
   * modalities; a row without modality metadata goes through the shared
   * classifier, which judges it by id.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const rows = await this.fetchCompatModelRows();
      const seen = new Set<string>();
      const models: LanguageModel[] = [];
      for (const row of rows) {
        const input = modalitiesOf(row, "input_modalities");
        const output = modalitiesOf(row, "output_modalities");
        if (input && !input.includes("text")) continue;
        if (output && !output.includes("text")) continue;
        if (!output && classifyListedModel(row).kind !== "language") continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const features = row.supported_features;
        this.toolSupport.set(
          row.id,
          Array.isArray(features) ? features.includes("tools") : true
        );
        if (typeof row.context_length === "number" && row.context_length > 0) {
          this.contextWindows.set(row.id, row.context_length);
        }
        models.push({
          id: row.id,
          name: isString(row.name) && row.name !== "" ? row.name : row.id,
          provider: this.provider
        });
      }
      return models;
    } catch (error) {
      log.warn("Runcrate model discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}
