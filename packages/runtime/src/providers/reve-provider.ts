/**
 * Reve Provider — exposes Reve's image API (create / edit) through the standard
 * {@link BaseProvider} interface so Reve models work from NodeTool's generic
 * image-generation nodes (model picker), and surfaces the `REVE_API_KEY` secret
 * in Settings → API Keys.
 *
 *   - textToImage  → POST /v1/image/create
 *   - imageToImage → POST /v1/image/edit
 *
 * The Remix endpoint (1–6 reference images, indexed `<img>` prompt tags) does
 * not map cleanly onto the single-image `imageToImage` shape, so it is exposed
 * only via the `@nodetool-ai/reve-nodes` `reve.RemixImage` node.
 *
 * Wire spec (https://api.reve.com/console/docs):
 *  - Auth:    `Authorization: Bearer <api_key>`.
 *  - Body:    JSON; reference images are base64-encoded strings.
 *  - Accept:  `application/json` → response carries a base64 PNG in `image`.
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageModel,
  ImageToImageParams,
  Message,
  ProviderStreamItem,
  TextToImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.reve");

const REVE_API_BASE = "https://api.reve.com";

/** Model ids exposed to the generic image composer. */
const REVE_CREATE_MODEL = "reve-create";
const REVE_EDIT_MODEL = "reve-edit";

const VALID_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "1:1"
]);

interface ReveImageResponse {
  image?: string;
  content_violation?: boolean;
  request_id?: string;
  credits_used?: number;
  credits_remaining?: number;
}

export class ReveProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["REVE_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("reve");
    this.apiKey = (secrets["REVE_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { REVE_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("REVE_API_KEY is not configured");
    }
    return this.apiKey;
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("reve does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("reve does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    if (!this.apiKey) return [];
    return [
      {
        id: REVE_CREATE_MODEL,
        name: "Reve Create",
        provider: "reve",
        supportedTasks: ["text_to_image"]
      },
      {
        id: REVE_EDIT_MODEL,
        name: "Reve Edit",
        provider: "reve",
        supportedTasks: ["image_to_image"]
      }
    ];
  }

  private async post(
    endpoint: "create" | "edit",
    body: Record<string, unknown>
  ): Promise<Uint8Array> {
    const response = await fetch(`${REVE_API_BASE}/v1/image/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(
        `Reve ${endpoint} failed: ${response.status} ${await response.text()}`
      );
    }
    const json = (await response.json()) as ReveImageResponse;
    if (json.content_violation) {
      throw new Error("Reve flagged this request as a content policy violation");
    }
    if (!json.image) {
      throw new Error(`Reve returned no image: ${JSON.stringify(json)}`);
    }
    return new Uint8Array(Buffer.from(json.image, "base64"));
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const body: Record<string, unknown> = { prompt: params.prompt };
    if (params.aspectRatio && VALID_ASPECT_RATIOS.has(params.aspectRatio)) {
      body.aspect_ratio = params.aspectRatio;
    }
    log.debug("Reve textToImage", { model: params.model.id });
    return this.post("create", body);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const body: Record<string, unknown> = {
      edit_instruction: params.prompt,
      reference_image: Buffer.from(image).toString("base64")
    };
    if (params.aspectRatio && VALID_ASPECT_RATIOS.has(params.aspectRatio)) {
      body.aspect_ratio = params.aspectRatio;
    }
    log.debug("Reve imageToImage", { model: params.model.id });
    return this.post("edit", body);
  }
}
