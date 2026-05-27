/**
 * AtlasCloud Provider — exposes AtlasCloud.ai's hosted image and video models
 * through the standard {@link BaseProvider} interface, and surfaces the
 * `ATLASCLOUD_API_KEY` secret in Settings → API Keys.
 *
 * Image/video generation is also driven directly by the
 * `@nodetool-ai/atlascloud-nodes` nodes (each manifest entry becomes a typed
 * node). This provider class exists so the secret is registered and the
 * model list shows up in the model picker — the nodes themselves are the
 * primary surface today.
 *
 * Wire spec (per AtlasCloud docs + Gap #3 in the POC INTEGRATION.md):
 *  - Auth: `Authorization: Bearer <api_key>`
 *  - Submit: POST /api/v1/model/generate{Image,Video}, FLAT body
 *      { model, ...fields }   (NOT nested under `input`)
 *  - Poll:   GET  /api/v1/model/prediction/{id}
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import { loadImageModels, loadVideoModels } from "./manifest-models.js";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  VideoModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.atlascloud");

const ATLASCLOUD_MANIFEST_PKG = "@nodetool-ai/atlascloud-nodes";
const ATLASCLOUD_MANIFEST_PATH = "atlascloud-manifest.json";

export class AtlasCloudProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["ATLASCLOUD_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("atlascloud");
    this.apiKey = (secrets["ATLASCLOUD_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { ATLASCLOUD_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("atlascloud does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("atlascloud does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    if (!this.apiKey) return [];
    try {
      return loadImageModels(
        ATLASCLOUD_MANIFEST_PKG,
        ATLASCLOUD_MANIFEST_PATH,
        "atlascloud"
      );
    } catch (err) {
      log.warn(`Failed to load AtlasCloud image models: ${err}`);
      return [];
    }
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    if (!this.apiKey) return [];
    try {
      return loadVideoModels(
        ATLASCLOUD_MANIFEST_PKG,
        ATLASCLOUD_MANIFEST_PATH,
        "atlascloud"
      );
    } catch (err) {
      log.warn(`Failed to load AtlasCloud video models: ${err}`);
      return [];
    }
  }
}
