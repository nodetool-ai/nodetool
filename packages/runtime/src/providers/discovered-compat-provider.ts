import { OpenAICompatProvider } from "./openai-compat-provider.js";
import type { LanguageModel } from "./types.js";

/**
 * An OpenAI-compatible gateway whose `/models` listing also reports each
 * model's tool support and context window. `getAvailableLanguageModels` fills
 * `toolSupport` and `contextWindows`, and the lookups below run discovery once
 * per instance when a model was not listed yet.
 */
export abstract class DiscoveredCompatProvider extends OpenAICompatProvider {
  /** Native tool support per model id, from the last discovery. */
  protected toolSupport = new Map<string, boolean>();
  /** `context_length` per model id, from the last discovery. */
  protected contextWindows = new Map<string, number>();
  private discoveryLoad: Promise<LanguageModel[]> | null = null;

  abstract override getAvailableLanguageModels(): Promise<LanguageModel[]>;

  private async ensureDiscovered(model: string): Promise<void> {
    if (this.toolSupport.has(model)) return;
    this.discoveryLoad ??= this.getAvailableLanguageModels();
    await this.discoveryLoad;
  }

  /** A model the listing did not describe keeps native tools on. */
  override async hasToolSupport(model: string): Promise<boolean> {
    await this.ensureDiscovered(model);
    return this.toolSupport.get(model) ?? true;
  }

  /** The `context_length` the listing reports, or null for an unlisted model. */
  override async getContextWindow(model: string): Promise<number | null> {
    await this.ensureDiscovered(model);
    return this.contextWindows.get(model) ?? null;
  }
}
