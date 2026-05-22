/**
 * Topaz Labs Provider — exposes Topaz's image enhancement (precision upscale
 * and generative Redefine) through the standard {@link BaseProvider} interface
 * as an `upscale_image` capability, and surfaces the `TOPAZ_API_KEY` secret in
 * Settings → API Keys.
 *
 * Video enhancement is handled by the `@nodetool-ai/topaz-nodes`
 * `topaz.video.EnhanceVideo` node (it needs local ffprobe metadata probing and
 * a multi-step upload pipeline), so it is intentionally not duplicated here.
 *
 * Topaz authenticates with the `X-API-Key` header. Image model definitions are
 * loaded from the manifest shipped by @nodetool-ai/topaz-nodes.
 *
 * Image API docs: https://developer.topazlabs.com/getting-started/image-api-quickstart
 */

import { createRequire } from "node:module";
import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  UpscaleImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.topaz");

const TOPAZ_ENHANCE_ENDPOINT = "https://api.topazlabs.com/image/v1/enhance/async";
const TOPAZ_ENHANCE_GEN_ENDPOINT =
  "https://api.topazlabs.com/image/v1/enhance-gen/async";
const TOPAZ_STATUS_ENDPOINT =
  "https://api.topazlabs.com/image/v1/status/{process_id}";
const TOPAZ_DOWNLOAD_ENDPOINT =
  "https://api.topazlabs.com/image/v1/download/{process_id}";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 400;

const TOPAZ_MANIFEST_PKG = "@nodetool-ai/topaz-nodes";
const TOPAZ_MANIFEST_PATH = "topaz-manifest.json";

interface TopazManifestNode {
  modelId?: string;
  title?: string;
  outputType?: string;
}

function loadImageModelIds(): ImageModel[] {
  try {
    const req = createRequire(import.meta.url);
    const manifest = req(
      `${TOPAZ_MANIFEST_PKG}/${TOPAZ_MANIFEST_PATH}`
    ) as TopazManifestNode[];
    return manifest
      .filter((n) => n.outputType === "image" && n.modelId)
      .map((n) => ({
        id: n.modelId as string,
        name: n.title ?? (n.modelId as string),
        provider: "topaz",
        supportedTasks: ["upscale"]
      }));
  } catch (err) {
    log.warn(`Could not load Topaz image models: ${err}`);
    return [];
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function detectImageMime(image: Uint8Array): string {
  if (
    image.length >= 4 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47
  ) {
    return "image/png";
  }
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export class TopazProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["TOPAZ_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("topaz");
    this.apiKey = (secrets["TOPAZ_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { TOPAZ_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("TOPAZ_API_KEY is not configured");
    }
    return this.apiKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "X-API-Key": this.requireApiKey(), ...extra };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("topaz does not support chat generation");
  }

  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("topaz does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    if (!this.apiKey) return [];
    return loadImageModelIds();
  }

  override async upscaleImage(
    image: Uint8Array,
    params: UpscaleImageParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const generative = (params.model.id ?? "").toLowerCase().includes("gen");

    const form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(image) as Uint8Array<ArrayBuffer>], {
        type: detectImageMime(image)
      }),
      "input"
    );
    form.set("model", generative ? "Redefine" : "Standard V2");
    if (params.scale != null) form.set("scale", String(params.scale));
    if (generative && params.prompt) form.set("prompt", params.prompt);
    if (generative && params.creativity != null) {
      // UpscaleImageParams.creativity is 0–1; Topaz generative creativity is 1–9.
      const level = Math.min(9, Math.max(1, Math.round(params.creativity * 8) + 1));
      form.set("creativity", String(level));
    }

    const endpoint = generative
      ? TOPAZ_ENHANCE_GEN_ENDPOINT
      : TOPAZ_ENHANCE_ENDPOINT;

    log.debug("Topaz upscaleImage", { model: params.model.id, generative });

    const submit = await fetch(endpoint, {
      method: "POST",
      headers: this.headers(),
      body: form
    });
    if (!submit.ok) {
      throw new Error(
        `Topaz submit failed: ${submit.status} ${await submit.text()}`
      );
    }
    const submitJson = (await submit.json()) as Record<string, unknown>;
    const processId = (submitJson.process_id ?? submitJson.id) as
      | string
      | undefined;
    if (!processId) {
      throw new Error(
        `Topaz did not return a process_id: ${JSON.stringify(submitJson)}`
      );
    }

    await this.pollUntilDone(processId);
    return this.downloadResult(processId);
  }

  private async pollUntilDone(processId: string): Promise<void> {
    const url = TOPAZ_STATUS_ENDPOINT.replace("{process_id}", processId);
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Topaz status poll failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      const status = String(data.status ?? "").toLowerCase();
      if (["completed", "succeeded", "success"].includes(status)) return;
      if (["failed", "error", "cancelled"].includes(status)) {
        throw new Error(`Topaz job failed: ${JSON.stringify(data)}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `Topaz job did not complete within ${MAX_POLL_ATTEMPTS} poll attempts`
    );
  }

  private async downloadResult(processId: string): Promise<Uint8Array> {
    const url = TOPAZ_DOWNLOAD_ENDPOINT.replace("{process_id}", processId);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Topaz download lookup failed: ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const finalUrl = (json.url ?? json.download_url) as string | undefined;
    if (!finalUrl) {
      throw new Error(`No download URL in response: ${JSON.stringify(json)}`);
    }
    const dl = await fetch(finalUrl);
    if (!dl.ok) throw new Error(`Failed to fetch Topaz result: ${dl.status}`);
    return new Uint8Array(await dl.arrayBuffer());
  }
}
