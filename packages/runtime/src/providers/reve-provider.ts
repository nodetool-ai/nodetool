/**
 * Reve Provider — exposes Reve's image API (create / edit) through the standard
 * {@link BaseProvider} interface so Reve models work from NodeTool's generic
 * image-generation nodes (model picker), and surfaces the `REVE_API_KEY` secret
 * in Settings → API Keys.
 *
 *   - textToImage  → POST /v1/image/create
 *   - imageToImage → POST /v1/image/edit   (one source image)
 *                  → POST /v1/image/remix  (two or more reference images)
 *   - callEndpoint → any of the three, named by `model`. The
 *                    `@nodetool-ai/reve-nodes` nodes call Reve this way.
 *
 * imageToImage routes by image count: a single source image uses the Edit
 * endpoint (`edit_instruction` + one base64 `reference_image`); two or more use
 * the Remix endpoint (`prompt` + a base64 `reference_images` array, capped at
 * 6 — the only Reve endpoint that accepts more than one reference image).
 * Remix's indexed `<img>` prompt tags remain the domain of the
 * `@nodetool-ai/reve-nodes` `reve.RemixImage` node.
 *
 * These are Reve's v1 endpoints. Reve's v2 API
 * (https://api.reve.com/console/docs/v2/) reportedly lifts the reference-image
 * ceiling to 8 on a unified create/edit endpoint; migrating there is future
 * work and is not wired here.
 *
 * Wire spec (https://api.reve.com/console/docs):
 *  - Auth:    `Authorization: Bearer <api_key>`.
 *  - Body:    JSON; reference images are base64-encoded strings.
 *  - Accept:  `application/json` → response carries a base64 PNG in `image`.
 */

import {
  BaseProvider,
  type EndpointCallRequest,
  type EndpointCallResult,
  type ProviderCapability
} from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import type {
  ImageModel,
  ImageToImageParams,
  Message,
  ProviderStreamItem,
  TextToImageParams
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.reve");

const REVE_API_BASE = "https://api.reve.com";

/** Model ids exposed to the generic image composer. */
const REVE_CREATE_MODEL = "reve-create";
const REVE_EDIT_MODEL = "reve-edit";

/**
 * The endpoint `callEndpoint` posts to for each model id it accepts. The ids
 * match the image models above, plus Remix, which the composer reaches only
 * through imageToImage.
 */
const REVE_ENDPOINT_MODELS: Readonly<Record<string, ReveEndpoint>> = {
  [REVE_CREATE_MODEL]: "create",
  [REVE_EDIT_MODEL]: "edit",
  "reve-remix": "remix"
};

type ReveEndpoint = "create" | "edit" | "remix";

/** Max reference images accepted by the Remix endpoint. */
const REVE_MAX_REMIX_IMAGES = 6;

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

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image", "image_to_image"];
  }

  static override requiredSecrets(): string[] {
    return ["REVE_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("reve");
    this.apiKey = (secrets["REVE_API_KEY"] as string) ?? "";
  }

  override getContainerEnv() {
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

  private send(
    endpoint: ReveEndpoint,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.requireApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    };
    if (signal) init.signal = signal;
    return fetch(`${REVE_API_BASE}/v1/image/${endpoint}`, init);
  }

  override supportsEndpointCalls(): boolean {
    return true;
  }

  /**
   * Call one Reve image endpoint. `model` names it: `reve-create`,
   * `reve-edit` or `reve-remix`. `input` is the JSON body, sent unchanged.
   * Reve has no sub-routes, so a `route` is rejected. The output is Reve's
   * JSON reply, with the generated image as base64 in `image`.
   *
   * A flagged content violation throws, because Reve returns no usable image
   * for it. Reading `image` is left to the caller.
   */
  override async callEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    if (req.route !== undefined) {
      throw new Error(
        `reve does not accept an endpoint route, got "${req.route}"`
      );
    }
    const endpoint = Object.hasOwn(REVE_ENDPOINT_MODELS, req.model)
      ? REVE_ENDPOINT_MODELS[req.model]
      : undefined;
    if (!endpoint) {
      throw new Error(
        `reve has no endpoint for model "${req.model}". Use one of: ${Object.keys(REVE_ENDPOINT_MODELS).join(", ")}`
      );
    }
    const response = await this.send(endpoint, req.input, req.signal);
    if (!response.ok) {
      throw new Error(
        `Reve API error (${response.status}): ${await response.text()}`
      );
    }
    const json = (await response.json()) as ReveImageResponse;
    if (json.content_violation) {
      throw new Error(
        "Reve flagged this request as a content policy violation"
      );
    }
    const metadata: Record<string, unknown> = {};
    if (typeof json.credits_used === "number") {
      metadata.credits_used = json.credits_used;
    }
    if (typeof json.credits_remaining === "number") {
      metadata.credits_remaining = json.credits_remaining;
    }
    const requestId =
      typeof json.request_id === "string" && json.request_id
        ? json.request_id
        : null;
    if (requestId) {
      await recordGenerationReceiptAsync({ provider_request_id: requestId });
    }
    return { output: json, requestId, metadata };
  }

  private async post(
    endpoint: ReveEndpoint,
    body: Record<string, unknown>
  ): Promise<Uint8Array> {
    const response = await this.send(endpoint, body);
    if (!response.ok) {
      throw new Error(
        `Reve ${endpoint} failed: ${response.status} ${await response.text()}`
      );
    }
    const json = (await response.json()) as ReveImageResponse;
    if (json.content_violation) {
      throw new Error(
        "Reve flagged this request as a content policy violation"
      );
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
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("Reve textToImage", { model: params.model.id });
    return this.post("create", body);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const sources = images.filter((b) => b && b.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty");
    }
    if (sources.length > REVE_MAX_REMIX_IMAGES) {
      throw new Error(
        `Reve accepts at most ${REVE_MAX_REMIX_IMAGES} reference images, got ${sources.length}.`
      );
    }
    const aspectRatio =
      params.aspectRatio && VALID_ASPECT_RATIOS.has(params.aspectRatio)
        ? params.aspectRatio
        : undefined;

    // One source image uses Edit; two or more use Remix — the only Reve
    // endpoint that accepts multiple reference images.
    if (sources.length === 1) {
      const body: Record<string, unknown> = {
        edit_instruction: params.prompt,
        reference_image: Buffer.from(sources[0]).toString("base64")
      };
      if (aspectRatio) body.aspect_ratio = aspectRatio;
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.debug("Reve imageToImage (edit)", { model: params.model.id });
      return this.post("edit", body);
    }

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      reference_images: sources.map((b) => Buffer.from(b).toString("base64"))
    };
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("Reve imageToImage (remix)", {
      model: params.model.id,
      images: sources.length
    });
    return this.post("remix", body);
  }
}
