import { createLogger } from "@nodetool-ai/config";
import {
  isPositiveFiniteNumber,
  isRecord,
  isString
} from "@nodetool-ai/protocol";
import { safeFetch } from "./safe-url.js";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import type { ProviderCapability } from "./base-provider.js";
import type {
  ImageModel,
  LanguageModel,
  TextToImageParams
} from "./types.js";
import { classifyListedModel } from "./custom-model-kinds.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.uberllm");

const UBERLLM_BASE_URL = "https://api.uberllm.dev/v1";
const UBERLLM_ORIGIN = "https://api.uberllm.dev/";
const IMAGE_GENERATIONS_ENDPOINT = "/v1/images/generations";

/** Body of `POST /images/generations`. */
interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n: 1;
  response_format: "b64_json";
  size?: string;
}

/**
 * UberLLM is an OpenAI-compatible gateway: one key for chat models and for
 * image, video and music models. Its chat `/models` listing rows carry
 * `display_name`, `context_length`, `supported_parameters` and
 * `architecture` modalities. `/models?type=image` lists the image models, each
 * with the `endpoints` it serves; the ones on `/v1/images/generations` back
 * text-to-image here.
 */
export class UberLLMProvider extends OpenAICompatProvider {
  /** `supported_parameters` includes `"tools"`, per model id, from the last discovery. */
  private toolSupport = new Map<string, boolean>();
  /** `context_length` per model id, from the last discovery. */
  private contextWindows = new Map<string, number>();
  private discoveryLoad: Promise<unknown> | null = null;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image"];
  }

  static override requiredSecrets(): string[] {
    return ["UBERLLM_API_KEY"];
  }

  constructor(
    secrets: { UBERLLM_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.UBERLLM_API_KEY;
    if (!apiKey) throw new Error("UBERLLM_API_KEY is required");
    super(
      {
        providerId: "uberllm",
        apiKey,
        baseURL: UBERLLM_BASE_URL
      },
      options
    );
  }

  override getContainerEnv(): Record<string, string> {
    return { UBERLLM_API_KEY: this.apiKey };
  }

  /** Runs discovery once per instance when the model was not listed yet. */
  private async ensureDiscovered(model: string): Promise<void> {
    if (this.toolSupport.has(model)) return;
    this.discoveryLoad ??= this.getAvailableLanguageModels();
    await this.discoveryLoad;
  }

  /**
   * A row whose `supported_parameters` omits `"tools"` turns native tools off;
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
   * Keep the chat models the shared classifier judges to be language models
   * (it reads `architecture.output_modalities`). Duplicate ids are dropped.
   * Any fetch failure answers `[]`.
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
        if (isPositiveFiniteNumber(row.context_length)) {
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
      log.warn("UberLLM model discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Image models from `/models?type=image` that serve
   * `/v1/images/generations`. Edit-only rows and rows marked
   * `available: false` stay out. Any fetch failure answers `[]`.
   */
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    try {
      const rows = await this.fetchCompatModelRows(
        `${UBERLLM_BASE_URL}/models?type=image`
      );
      const seen = new Set<string>();
      const models: ImageModel[] = [];
      for (const row of rows) {
        const endpoints = Array.isArray(row.endpoints) ? row.endpoints : [];
        if (!endpoints.includes(IMAGE_GENERATIONS_ENDPOINT)) continue;
        if (row.available === false) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        models.push({
          id: row.id,
          name:
            isString(row.display_name) && row.display_name !== ""
              ? row.display_name
              : row.id,
          provider: this.provider,
          supportedTasks: ["text_to_image"]
        });
      }
      return models;
    } catch (error) {
      log.warn("UberLLM image model discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * `POST /images/generations` with `response_format: "b64_json"`, so the
   * picture comes back in the answer. A `url` answer on UberLLM's own host
   * is downloaded with the same key; any other host goes through `safeFetch`
   * without it.
   */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }
    const body: ImageGenerationRequest = {
      model: params.model.id,
      prompt: params.negativePrompt
        ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
        : params.prompt,
      n: 1,
      response_format: "b64_json"
    };
    if (params.width && params.height) {
      body.size = `${params.width}x${params.height}`;
    }

    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
    if (params.signal) init.signal = params.signal;
    const response = await this.compatFetch(
      `${UBERLLM_BASE_URL}/images/generations`,
      init
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `UberLLM image generation failed (${response.status}): ${detail}`
      );
    }

    const payload: unknown = await response.json();
    const data = isRecord(payload) ? payload.data : undefined;
    const item = Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
    if (item && isString(item.b64_json) && item.b64_json !== "") {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }
    if (item && isString(item.url) && item.url !== "") {
      const download = item.url.startsWith(UBERLLM_ORIGIN)
        ? await this.compatFetch(item.url, {
            headers: { Authorization: `Bearer ${this.apiKey}` }
          })
        : await safeFetch(item.url, undefined, 5, this.compatFetch);
      if (!download.ok) {
        throw new Error(`Image fetch failed: ${download.status}`);
      }
      return new Uint8Array(await download.arrayBuffer());
    }
    throw new Error("UberLLM image generation returned no image data.");
  }
}
