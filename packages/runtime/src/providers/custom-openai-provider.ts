/**
 * A provider the user defined at runtime: any endpoint that speaks the OpenAI
 * Chat Completions dialect, reached by base URL plus optional API key.
 *
 * Unlike every other provider here, this class is not registered under one
 * fixed id. The host registers one entry per user-defined provider, passing the
 * wire id and the secret names to read through the registry's kwargs — so the
 * base URL and key still resolve per user at `getProvider()` time and nothing
 * is baked in at module load.
 */

import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { isString, normalizeBaseUrl } from "@nodetool-ai/protocol";
import type { LanguageModel } from "./types.js";

/** Cap on the model-list probe so an unreachable proxy cannot stall the model menu. */
const MODEL_LIST_TIMEOUT_MS = 5000;

/**
 * Kwargs the registry hands the constructor. The registry constructs every
 * provider from a plain `Record<string, unknown>`, so the shape is documented
 * rather than declared, and each key is narrowed as it is read:
 *
 * - `_providerId` — the wire id this instance reports.
 * - `_baseUrlKey` / `_apiKeyKey` — names of the two resolved secrets; their
 *   values arrive on this same object under those names.
 * - `_models` — model ids to report instead of calling `GET <base>/models`.
 *
 * The `_`-prefixed keys are runtime injections the registry excludes from its
 * credential check.
 */
export type CustomOpenAIProviderConfig = Record<string, unknown>;

/** Placeholder key for endpoints that accept anonymous requests. */
const NO_KEY = "no-key";

function readString(config: CustomOpenAIProviderConfig, key: string): string {
  const value = config[key];
  return isString(value) ? value.trim() : "";
}

function readModels(config: CustomOpenAIProviderConfig): string[] {
  const value = config._models;
  return Array.isArray(value) ? value.filter(isString) : [];
}

export class CustomOpenAIProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  private readonly _customModels: string[];
  private readonly _baseUrlKey: string;
  private readonly _apiKeyKey: string;

  constructor(
    config: CustomOpenAIProviderConfig,
    options: OpenAICompatProviderOptions = {}
  ) {
    const providerId = readString(config, "_providerId");
    if (!providerId) {
      throw new Error("_providerId is required for a custom provider");
    }
    const baseUrlKey = readString(config, "_baseUrlKey");
    if (!baseUrlKey) {
      throw new Error("_baseUrlKey is required for a custom provider");
    }
    const apiKeyKey = readString(config, "_apiKeyKey");
    if (!apiKeyKey) {
      throw new Error("_apiKeyKey is required for a custom provider");
    }
    const baseURL = normalizeBaseUrl(readString(config, baseUrlKey));
    if (!baseURL) {
      throw new Error(`${baseUrlKey} is required`);
    }
    const apiKey = readString(config, apiKeyKey) || NO_KEY;

    super({ providerId, apiKey, baseURL }, options);

    this._customModels = readModels(config);
    this._baseUrlKey = baseUrlKey;
    this._apiKeyKey = apiKeyKey;
  }

  override getContainerEnv(): Record<string, string> {
    const env: Record<string, string> = {
      [this._baseUrlKey]: this.compatBaseURL
    };
    if (this.apiKey && this.apiKey !== NO_KEY) {
      env[this._apiKeyKey] = this.apiKey;
    }
    return env;
  }

  /**
   * Nothing on the wire announces tool support, and it is a property of
   * whatever sits behind the proxy. A model that lacks it fails at call time
   * with the endpoint's own error; answering `false` here would hide the
   * capability from every model behind every custom provider.
   */
  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    if (this._customModels.length > 0) {
      return this._customModels.map((id) => ({
        id,
        name: id,
        provider: this.provider
      }));
    }
    try {
      return await this.listCompatModels(undefined, {
        signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
      });
    } catch {
      // An unreachable or slow proxy must not break the model menu.
      return [];
    }
  }
}
