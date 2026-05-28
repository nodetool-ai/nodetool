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
 * loaded from the manifest shipped by @nodetool-ai/topaz-nodes — each manifest
 * entry is expanded into one `ImageModel` per Topaz model variant (Standard V2,
 * High Fidelity V2, Redefine, ...) so callers can pick the variant explicitly.
 *
 * Image API docs: https://developer.topazlabs.com/getting-started/image-api-quickstart
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger, importNodeBuiltin } from "@nodetool-ai/config";
import { loadImageModels } from "./manifest-models.js";

const _nodeModule = await importNodeBuiltin<typeof import("node:module")>(
  "node:module"
);
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  UpscaleImageParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.topaz");

const TOPAZ_ENHANCE_ENDPOINT = "https://api.topazlabs.com/image/v1/enhance/async";
const TOPAZ_STATUS_ENDPOINT =
  "https://api.topazlabs.com/image/v1/status/{process_id}";
const TOPAZ_DOWNLOAD_ENDPOINT =
  "https://api.topazlabs.com/image/v1/download/{process_id}";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 400;

const TOPAZ_MANIFEST_PKG = "@nodetool-ai/topaz-nodes";
const TOPAZ_MANIFEST_PATH = "topaz-manifest.json";

/** Manifest endpoint IDs (must match topaz-manifest.json modelId values). */
const ENHANCE_MANIFEST_ID = "topaz/image/enhance";
const ENHANCE_GEN_MANIFEST_ID = "topaz/image/enhance-gen";
/** Only upscale/enhance endpoints are exposed as ImageModels (upscale task). */
const UPSCALE_MANIFEST_IDS = new Set([
  ENHANCE_MANIFEST_ID,
  ENHANCE_GEN_MANIFEST_ID
]);

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface TopazManifestField {
  name: string;
  values?: string[];
}
interface TopazManifestEntry {
  modelId?: string;
  title?: string;
  outputType?: string;
  submitEndpoint?: string;
  fields?: TopazManifestField[];
}

interface VariantInfo {
  /** Manifest entry's modelId (e.g. "topaz/image/enhance"). */
  endpointId: string;
  /** Topaz `model` field value to send in the request body. */
  variant: string;
  endpoint: string;
}

/**
 * Read the manifest and produce a per-variant map keyed by the public
 * `ImageModel.id` we expose (`<endpointId>/<variant>`). Falls back to a single
 * default variant per endpoint if the manifest is unavailable.
 */
function buildVariantMap(): Map<string, VariantInfo> {
  const map = new Map<string, VariantInfo>();
  if (!_nodeModule) return map;
  let manifest: TopazManifestEntry[] = [];
  try {
    const req = _nodeModule.createRequire(import.meta.url);
    manifest = req(`${TOPAZ_MANIFEST_PKG}/${TOPAZ_MANIFEST_PATH}`);
  } catch (err) {
    log.warn(`Could not load Topaz manifest: ${err}`);
    return map;
  }
  for (const entry of manifest) {
    if (entry.outputType !== "image" || !entry.modelId) continue;
    // Only expose enhance / enhance-gen as upscale models. Sharpen, denoise,
    // lighting, restore, matting endpoints have their own nodes and aren't
    // "upscale" operations from the provider's perspective.
    if (!UPSCALE_MANIFEST_IDS.has(entry.modelId)) continue;
    const generative = entry.modelId === ENHANCE_GEN_MANIFEST_ID;
    const endpoint = entry.submitEndpoint ?? TOPAZ_ENHANCE_ENDPOINT;
    const modelField = entry.fields?.find((f) => f.name === "model");
    const variants = modelField?.values?.length
      ? modelField.values
      : [generative ? "Redefine" : "Standard V2"];
    for (const variant of variants) {
      map.set(`${entry.modelId}/${variant}`, {
        endpointId: entry.modelId,
        variant,
        endpoint
      });
    }
  }
  return map;
}

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
  private variantMap: Map<string, VariantInfo> | null = null;

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

  private getVariantMap(): Map<string, VariantInfo> {
    if (!this.variantMap) this.variantMap = buildVariantMap();
    return this.variantMap;
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("topaz does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("topaz does not support chat generation");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    if (!this.apiKey) return [];
    // Shared manifest loader handles dedup + naming; Topaz is purely an
    // upscale/enhance provider, so we override the inferred tasks. Then expand
    // each manifest entry into one ImageModel per Topaz model variant.
    const base = loadImageModels(
      TOPAZ_MANIFEST_PKG,
      TOPAZ_MANIFEST_PATH,
      "topaz"
    );
    const variantMap = this.getVariantMap();
    const out: ImageModel[] = [];
    for (const m of base) {
      // Skip non-upscale endpoints (sharpen / denoise / lighting / matting / ...).
      if (!UPSCALE_MANIFEST_IDS.has(m.id)) continue;
      const variants = [...variantMap.entries()].filter(
        ([, v]) => v.endpointId === m.id
      );
      if (variants.length === 0) {
        out.push({ ...m, supportedTasks: ["upscale"] });
        continue;
      }
      for (const [id, v] of variants) {
        out.push({
          id,
          name: `${m.name} — ${v.variant}`,
          provider: "topaz",
          supportedTasks: ["upscale"]
        });
      }
    }
    return out;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit = {},
    maxAttempts = 6
  ): Promise<Response> {
    let delay = 1000;
    let last: Response | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const resp = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(resp.status)) return resp;
      last = resp;
      if (attempt === maxAttempts) break;
      const retryAfter = resp.headers.get("Retry-After");
      const wait = retryAfter ? Number(retryAfter) * 1000 : delay;
      await sleep(wait);
      delay = Math.min(delay * 2, 30000);
    }
    return last as Response;
  }

  /**
   * Resolve the request endpoint and Topaz `model` field value for a given
   * `ImageModel.id`. Supports both the per-variant IDs returned by
   * {@link getAvailableImageModels} and bare manifest IDs (back-compat).
   */
  private resolveModel(modelId: string): VariantInfo {
    const variantMap = this.getVariantMap();
    const direct = variantMap.get(modelId);
    if (direct) return direct;
    // Bare endpoint ID — pick the first variant.
    for (const v of variantMap.values()) {
      if (v.endpointId === modelId) return v;
    }
    // Last-resort fallback: assume precision endpoint with Standard V2.
    log.warn(`Unknown Topaz model id "${modelId}", defaulting to Standard V2`);
    return {
      endpointId: "topaz/image/enhance",
      variant: "Standard V2",
      endpoint: TOPAZ_ENHANCE_ENDPOINT
    };
  }

  override async upscaleImage(
    image: Uint8Array,
    params: UpscaleImageParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty");
    }
    const resolved = this.resolveModel(params.model.id ?? "");
    const generative = resolved.endpointId === ENHANCE_GEN_MANIFEST_ID;

    const form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(image) as Uint8Array<ArrayBuffer>], {
        type: detectImageMime(image)
      }),
      "input"
    );
    form.set("model", resolved.variant);
    if (params.scale != null) form.set("scale", String(params.scale));
    if (generative && params.prompt) form.set("prompt", params.prompt);
    if (generative && params.creativity != null) {
      // UpscaleImageParams.creativity is 0–1; Topaz generative creativity is 1–9.
      const level = Math.min(9, Math.max(1, Math.round(params.creativity * 8) + 1));
      form.set("creativity", String(level));
    }

    log.debug("Topaz upscaleImage", {
      model: params.model.id,
      variant: resolved.variant,
      generative
    });

    const submit = await this.fetchWithRetry(resolved.endpoint, {
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
      const res = await this.fetchWithRetry(url, { headers: this.headers() });
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
    const res = await this.fetchWithRetry(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Topaz download lookup failed: ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    const finalUrl = (json.url ?? json.download_url) as string | undefined;
    if (!finalUrl) {
      throw new Error(`No download URL in response: ${JSON.stringify(json)}`);
    }
    const dl = await this.fetchWithRetry(finalUrl);
    if (!dl.ok) throw new Error(`Failed to fetch Topaz result: ${dl.status}`);
    return new Uint8Array(await dl.arrayBuffer());
  }
}
