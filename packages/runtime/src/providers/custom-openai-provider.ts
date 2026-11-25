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
import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive,
  isString,
  normalizeBaseUrl
} from "@nodetool-ai/protocol";
import { assertSafePublicHttpsUrl, safeFetch } from "./safe-url.js";
import {
  classifyListedModel,
  type ListedModelCapability,
  type ListedModelKind
} from "./custom-model-kinds.js";
import {
  checkImageRequest,
  profileAspectRatios,
  profileVideoResolutions,
  readListedMediaProfile,
  resolveVideoRequest,
  type ListedMediaProfile
} from "./custom-media-profile.js";
import type {
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  InpaintingParams,
  LanguageModel,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";
import type { ProviderCapability } from "./base-provider.js";

function isCloudProfileOn(): boolean {
  if (typeof process === "undefined") return false;
  return isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

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
  capabilities: ListedModelCapability[];
  /** True when the endpoint's own metadata or the user said so, not the id. */
  certain: boolean;
  /** Request shapes the row declares; see `custom-media-profile.ts`. */
  profile?: ListedMediaProfile;
}

const IMAGE_TASKS = ["text_to_image", "image_to_image"];

function countImages(images: Uint8Array[]): number {
  return images.filter((b) => b && b.length > 0).length;
}
const VIDEO_TASKS = ["text_to_video", "image_to_video"];

export class CustomOpenAIProvider extends OpenAICompatProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video"
    ];
  }

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

    // The base URL is the user's own text, and the server fetches it. On the
    // cloud profile it gets the same SSRF policy as any other caller-chosen
    // URL: https to a public host, on every redirect hop too. A local or
    // self-hosted install keeps proxies on localhost and the LAN.
    if (isCloudProfileOn()) {
      assertSafePublicHttpsUrl(baseURL);
      const inner = options.fetchFn ?? globalThis.fetch.bind(globalThis);
      options = {
        ...options,
        fetchFn: (input, init) =>
          safeFetch(
            input instanceof Request ? input.url : String(input),
            init,
            undefined,
            inner
          )
      };
    }

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
    const classified = rows.map((row): ListedModel => {
      const name = isString(row.name) && row.name ? row.name : row.id;
      const profile = readListedMediaProfile(row);
      const markedKind = marked.get(row.id);
      if (markedKind) {
        return {
          id: row.id,
          name,
          kind: markedKind,
          capabilities: [],
          certain: true,
          profile
        };
      }
      const { kind, source, capability } = classifyListedModel(row);
      return {
        id: row.id,
        name,
        kind,
        capabilities: capability ? [capability] : [],
        certain: source === "metadata",
        profile
      };
    });
    const listed: ListedModel[] = [];
    const byIdAndKind = new Map<string, ListedModel>();
    for (const model of classified) {
      const key = JSON.stringify([model.id, model.kind]);
      const existing = byIdAndKind.get(key);
      if (!existing) {
        listed.push(model);
        byIdAndKind.set(key, model);
        continue;
      }
      existing.certain ||= model.certain;
      existing.profile ??= model.profile;
      for (const capability of model.capabilities) {
        if (!existing.capabilities.includes(capability)) {
          existing.capabilities.push(capability);
        }
      }
    }
    const seen = new Set(listed.map((m) => m.id));
    for (const [id, kind] of marked) {
      if (!seen.has(id)) {
        listed.push({ id, name: id, kind, capabilities: [], certain: true });
      }
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
   * `/images/edits`. A row that declares a media profile narrows the picker's
   * aspect ratios and resolutions; one that does not leaves the node's own
   * size options in place.
   */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const models = await this.listModels();
    return models
      .filter((m) => m.kind === "image")
      .map(({ id, name, capabilities, profile }) => {
        const model: ImageModel = {
          id,
          name,
          provider: this.provider,
          supportedTasks:
            capabilities.length > 0 ? [...capabilities] : [...IMAGE_TASKS]
        };
        if (profile) {
          const aspectRatios = profileAspectRatios(profile);
          if (aspectRatios) model.aspectRatios = aspectRatios;
          if (profile.resolutions) model.resolutions = [...profile.resolutions];
        }
        return model;
      });
  }

  /**
   * Video models, called through the OpenAI video API (`POST <base>/videos`,
   * then polled). A declared media profile narrows durations, resolutions
   * and aspect ratios the same way as for images.
   */
  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const models = await this.listModels();
    return models
      .filter((m) => m.kind === "video")
      .map(({ id, name, capabilities, profile }) => {
        const model: VideoModel = {
          id,
          name,
          provider: this.provider,
          supportedTasks:
            capabilities.length > 0 ? [...capabilities] : [...VIDEO_TASKS]
        };
        if (profile) {
          const aspectRatios = profileAspectRatios(profile);
          if (aspectRatios) model.aspectRatios = aspectRatios;
          const resolutions = profileVideoResolutions(profile);
          if (resolutions) model.resolutions = resolutions;
          if (profile.durations) model.durations = [...profile.durations];
        }
        return model;
      });
  }

  /** The profile the listing declares for a model of this kind, if any. */
  private async profileFor(
    modelId: string,
    kind: "image" | "video"
  ): Promise<ListedMediaProfile | undefined> {
    const models = await this.listModels();
    return models.find((m) => m.id === modelId && m.kind === kind)?.profile;
  }

  private async checkImageProfile(
    params: ImageToImageParams | TextToImageParams,
    width: number | null | undefined,
    height: number | null | undefined,
    inputImages?: number
  ): Promise<void> {
    const profile = await this.profileFor(params.model.id, "image");
    if (!profile) return;
    checkImageRequest(params.model.id, profile, {
      size: this.resolveImageSize(width, height),
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      inputImages
    });
  }

  /** Refuse a size the endpoint does not list before the call is billed. */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    await this.checkImageProfile(params, params.width, params.height);
    return super.textToImage(params);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    await this.checkImageProfile(
      params,
      params.targetWidth,
      params.targetHeight,
      countImages(images)
    );
    return super.imageToImage(images, params);
  }

  override async inpaint(
    images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Uint8Array> {
    await this.checkImageProfile(
      params,
      params.targetWidth,
      params.targetHeight,
      countImages(images)
    );
    return super.inpaint(images, params);
  }

  /**
   * Send the exact size and duration the endpoint lists for the model, and
   * refuse a request outside them. Without a declared profile the request
   * keeps the OpenAI video defaults.
   */
  protected override async resolveVideoRequest(
    params: TextToVideoParams | ImageToVideoParams
  ): Promise<{ size: string | null; seconds: number | null }> {
    const fallback = await super.resolveVideoRequest(params);
    const profile = await this.profileFor(params.model.id, "video");
    if (!profile) return fallback;
    const exact = resolveVideoRequest(params.model.id, profile, params);
    return {
      size: exact.size ?? fallback.size,
      seconds: exact.seconds ?? fallback.seconds
    };
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
