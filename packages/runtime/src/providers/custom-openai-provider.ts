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
  type CompatModelRow,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { isString, normalizeBaseUrl } from "@nodetool-ai/protocol";
import {
  classifyListedModel,
  type ListedModelKind
} from "./custom-model-kinds.js";
import type { ImageModel, LanguageModel, VideoModel } from "./types.js";

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
 * - `_imageModels` / `_videoModels` — ids the user marked as image or video
 *   models, offered on top of what the listing is detected to serve.
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

function readModels(
  config: CustomOpenAIProviderConfig,
  key: "_models" | "_imageModels" | "_videoModels"
): string[] {
  const value = config[key];
  return Array.isArray(value) ? value.filter(isString) : [];
}

/** A listed model and the kind it was sorted into. */
interface ListedModel {
  id: string;
  name: string;
  kind: ListedModelKind;
  /** True when the endpoint's own metadata or the user said so, not the id. */
  certain: boolean;
}

const IMAGE_TASKS = ["text_to_image", "image_to_image"];
const VIDEO_TASKS = ["text_to_video", "image_to_video"];

export class CustomOpenAIProvider extends OpenAICompatProvider {
  static override requiredSecrets(): string[] {
    return [];
  }

  private readonly _customModels: string[];
  private readonly _imageModels: string[];
  private readonly _videoModels: string[];
  /** One listing per instance: the chat, image and video pickers share it. */
  private _listing: Promise<ListedModel[]> | null = null;
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

    this._customModels = readModels(config, "_models");
    this._imageModels = readModels(config, "_imageModels");
    this._videoModels = readModels(config, "_videoModels");
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

  /**
   * Every model this endpoint offers, sorted by kind. Ids the user marked as
   * image or video models always win; the rest come from the hand-typed list
   * or `GET /models`, classified by {@link classifyListedModel}.
   */
  private listModels(): Promise<ListedModel[]> {
    this._listing ??= this.loadListing();
    return this._listing;
  }

  private async loadListing(): Promise<ListedModel[]> {
    const rows = await this.fetchListingRows();
    const marked = new Map<string, ListedModelKind>([
      ...this._imageModels.map((id) => [id, "image"] as const),
      ...this._videoModels.map((id) => [id, "video"] as const)
    ]);
    const listed: ListedModel[] = rows.map((row) => {
      const name = isString(row.name) && row.name ? row.name : row.id;
      const markedKind = marked.get(row.id);
      if (markedKind) {
        return { id: row.id, name, kind: markedKind, certain: true };
      }
      const { kind, source } = classifyListedModel(row);
      return { id: row.id, name, kind, certain: source === "metadata" };
    });
    const seen = new Set(listed.map((m) => m.id));
    for (const [id, kind] of marked) {
      if (!seen.has(id)) listed.push({ id, name: id, kind, certain: true });
    }
    return listed;
  }

  private async fetchListingRows(): Promise<CompatModelRow[]> {
    if (this._customModels.length > 0) {
      return this._customModels.map((id) => ({ id }));
    }
    try {
      return await this.fetchCompatModelRows(undefined, {
        signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
      });
    } catch {
      // An unreachable or slow proxy must not break the model menu.
      return [];
    }
  }

  /**
   * Chat models. A model the endpoint or the user identified as image or
   * video is left out; one that only has an image- or video-like id stays,
   * because the id alone is a guess and hiding a chat model would leave no
   * way to pick it.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const models = await this.listModels();
    return models
      .filter((m) => m.kind === "language" || !m.certain)
      .map(({ id, name }) => ({ id, name, provider: this.provider }));
  }

  /**
   * Image models, called through `POST <base>/images/generations` and
   * `/images/edits`. The listing says nothing about sizes, so no
   * constraints are declared and the node's own size options apply.
   */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const models = await this.listModels();
    return models
      .filter((m) => m.kind === "image")
      .map(({ id, name }) => ({
        id,
        name,
        provider: this.provider,
        supportedTasks: [...IMAGE_TASKS]
      }));
  }

  /**
   * Video models, called through the OpenAI video API (`POST <base>/videos`,
   * then polled). No durations or resolutions are declared, for the same
   * reason as image sizes.
   */
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const models = await this.listModels();
    return models
      .filter((m) => m.kind === "video")
      .map(({ id, name }) => ({
        id,
        name,
        provider: this.provider,
        supportedTasks: [...VIDEO_TASKS]
      }));
  }

  /**
   * Pass the requested size through. The base class snaps to the three sizes
   * OpenAI's own image models accept, which would squash a 16:9 request to a
   * FLUX or Seedream model behind a gateway into 1536x1024.
   */
  override resolveImageSize(
    width?: number | null,
    height?: number | null
  ): string | null {
    if (!width || !height) return null;
    return `${Math.round(width)}x${Math.round(height)}`;
  }
}
