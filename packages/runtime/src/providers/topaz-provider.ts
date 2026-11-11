/**
 * Topaz Labs Provider — exposes Topaz's image enhancement (precision upscale
 * and generative Redefine) through the standard {@link BaseProvider} interface
 * as an `upscale_image` capability, and surfaces the `TOPAZ_API_KEY` secret in
 * Settings → API Keys.
 *
 * The `@nodetool-ai/topaz-nodes` nodes reach every manifest endpoint through
 * {@link TopazProvider.callEndpoint}: the image API (multipart submit, poll,
 * download lookup) and the video API (create, accept, multipart upload,
 * complete, poll). The video nodes probe source metadata locally, so video
 * enhancement is not a capability method here.
 *
 * Topaz authenticates with the `X-API-Key` header. Image model definitions are
 * loaded from the manifest shipped by @nodetool-ai/topaz-nodes — each manifest
 * entry is expanded into one `ImageModel` per Topaz model variant (Standard V2,
 * High Fidelity V2, Redefine, ...) so callers can pick the variant explicitly.
 *
 * Image API docs: https://developer.topazlabs.com/getting-started/image-api-quickstart
 */

import {
  BaseProvider,
  type EndpointCallRequest,
  type EndpointCallResult,
  type MediaUpload,
  type ProviderCapability
} from "./base-provider.js";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import { assertSafePublicHttpsUrl, safeFetch } from "./safe-url.js";
import {
  fetchWithRetry,
  pollUntilTerminal,
  type PollUntilTerminalOptions
} from "./http-transport.js";
import { sniffImageMime } from "./image-mime.js";
import { createLogger } from "@nodetool-ai/config";
import { loadImageModels, loadManifest } from "./manifest-models.js";
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

interface TopazManifestField {
  name: string;
  values?: string[];
}
interface TopazManifestEntry {
  modelId?: string;
  title?: string;
  outputType?: string;
  submitEndpoint?: string;
  statusEndpoint?: string;
  downloadEndpoint?: string;
  acceptEndpoint?: string;
  completeEndpoint?: string;
  pollInterval?: number;
  maxAttempts?: number;
  fields?: TopazManifestField[];
}

/** The two Topaz API families, which are the `route` values callEndpoint accepts. */
type TopazRoute = "image" | "video";

/** A manifest entry with the endpoints its route needs. */
interface TopazEndpoint {
  route: TopazRoute;
  submit: string;
  status: string;
  download: string;
  accept: string;
  complete: string;
  pollInterval: number;
  maxAttempts: number;
}

const CONTAINER_CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo"
};

/** The upload part type for a source container, or octet-stream when unknown. */
export function topazContainerContentType(
  container: string | null | undefined
): string {
  if (!container) return "application/octet-stream";
  const key = container.replace(/^\./, "").toLowerCase();
  return CONTAINER_CONTENT_TYPES[key] ?? "application/octet-stream";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function topazEndpoint(modelId: string, route: string | undefined): TopazEndpoint {
  const manifest = loadManifest(
    TOPAZ_MANIFEST_PKG,
    TOPAZ_MANIFEST_PATH
  ) as TopazManifestEntry[];
  const entry = manifest.find((candidate) => candidate.modelId === modelId);
  if (!entry) throw new Error(`Unknown Topaz model: ${modelId}`);
  const family = entry.outputType === "video" ? "video" : "image";
  if (route !== undefined && route !== "image" && route !== "video") {
    throw new Error(`Topaz endpoint route must be "image" or "video", got "${route}"`);
  }
  if (route !== undefined && route !== family) {
    throw new Error(`Topaz model ${modelId} is on the ${family} route, not ${route}`);
  }
  return {
    route: family,
    submit: entry.submitEndpoint ?? "",
    status: entry.statusEndpoint ?? "",
    download: entry.downloadEndpoint ?? "",
    accept: entry.acceptEndpoint ?? "",
    complete: entry.completeEndpoint ?? "",
    pollInterval: entry.pollInterval ?? POLL_INTERVAL_MS,
    maxAttempts: entry.maxAttempts ?? MAX_POLL_ATTEMPTS
  };
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
  const manifest = loadManifest(
    TOPAZ_MANIFEST_PKG,
    TOPAZ_MANIFEST_PATH
  ) as TopazManifestEntry[];
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

// Multipart part type. Topaz reads the bytes either way, so claiming nothing
// beats claiming PNG wrongly.
function detectImageMime(image: Uint8Array): string {
  return sniffImageMime(image) ?? "application/octet-stream";
}

export class TopazProvider extends BaseProvider {
  private readonly apiKey: string;
  private variantMap: Map<string, VariantInfo> | null = null;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "upscale_image"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["TOPAZ_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("topaz");
    this.apiKey = (secrets["TOPAZ_API_KEY"] as string) ?? "";
  }

  override getContainerEnv() {
    return { TOPAZ_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("TOPAZ_API_KEY is not configured");
    }
    return this.apiKey;
  }

  private headers(extra: Record<string, string> = {}) {
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

    const lookup = await this.runImageJob(
      {
        route: "image",
        submit: resolved.endpoint,
        status: TOPAZ_STATUS_ENDPOINT,
        download: TOPAZ_DOWNLOAD_ENDPOINT,
        accept: "",
        complete: "",
        pollInterval: POLL_INTERVAL_MS,
        maxAttempts: MAX_POLL_ATTEMPTS
      },
      form
    );
    // Topaz documents `download_url`; some responses carry `url`. Accept both.
    const finalUrl = (lookup.output.download_url ?? lookup.output.url) as
      | string
      | undefined;
    if (!finalUrl) {
      throw new Error(
        `No download URL in response: ${JSON.stringify(lookup.output)}`
      );
    }
    return this.downloadMedia(finalUrl);
  }

  override supportsEndpointCalls(): boolean {
    return true;
  }

  /**
   * Run one manifest endpoint. `route` is "image" or "video" and defaults to
   * the model's own family. Topaz reads media bytes, not URLs, so the media
   * travels inside `input`:
   *
   * - image: `input.image` holds the image bytes and every other key is sent
   *   as a multipart form field. `output` is the download lookup body
   *   (`{ download_url, head_url, expiry }`).
   * - video: `input.video` holds the source bytes and every other key
   *   (`source`, `output`, `filters`) is the create-request body. The bytes go
   *   to the presigned part URLs the accept step returns, typed by
   *   `source.container`. `output` is the final status body, whose
   *   `download.url` names the result.
   *
   * `requestId` is the Topaz process id or video request id.
   */
  override async callEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const endpoint = topazEndpoint(req.model, req.route);
    if (endpoint.route === "video") return this.runVideoJob(endpoint, req);
    const { image, ...fields } = req.input;
    if (!(image instanceof Uint8Array) || image.byteLength === 0) {
      throw new Error("Topaz image endpoints need the image bytes in input.image");
    }
    const form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(image) as Uint8Array<ArrayBuffer>], {
        type: detectImageMime(image)
      }),
      "input"
    );
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      form.set(key, String(value));
    }
    return this.runImageJob(endpoint, form, req.signal, req.onProgress);
  }

  /** Topaz has no standalone upload: media travels inside the callEndpoint input. */
  override async uploadMedia(_upload: MediaUpload): Promise<string> {
    throw new Error(
      "topaz does not support media uploads: pass the bytes in the callEndpoint input"
    );
  }

  /**
   * Fetch a result URL. The URL comes out of a response body, so it goes
   * through safeFetch, which refuses internal hosts on every hop.
   */
  override async downloadMedia(
    url: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const res = await safeFetch(url, signal ? { signal } : undefined);
    if (!res.ok) throw new Error(`Failed to fetch Topaz result: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  private async runImageJob(
    endpoint: TopazEndpoint,
    form: FormData,
    signal?: AbortSignal,
    onProgress?: EndpointCallRequest["onProgress"]
  ): Promise<{ output: Record<string, unknown>; requestId: string }> {
    // POST creates a billable job: a single attempt, never a retry.
    const submit = await fetchWithRetry(
      endpoint.submit,
      this.init({ method: "POST", headers: this.headers(), body: form }, signal)
    );
    if (!submit.ok) {
      throw new Error(
        `Topaz submit failed: ${submit.status} ${await submit.text()}`
      );
    }
    // Spec returns { process_id, source_id, eta }. The process_id is also
    // available in the X-Process-ID response header.
    const submitJson = (await submit.json()) as Record<string, unknown>;
    const processId = (submitJson.process_id ??
      submitJson.id ??
      submit.headers?.get("X-Process-ID") ??
      undefined) as string | undefined;
    if (!processId) {
      throw new Error(
        `Topaz did not return a process_id: ${JSON.stringify(submitJson)}`
      );
    }
    await recordGenerationReceiptAsync({ provider_request_id: processId });

    await this.pollStatus(
      endpoint.status.replace("{process_id}", processId),
      endpoint,
      signal,
      onProgress
    );

    // Spec: { download_url, head_url, expiry }.
    const lookup = await fetchWithRetry(
      endpoint.download.replace("{process_id}", processId),
      this.init({ headers: this.headers() }, signal)
    );
    if (!lookup.ok) {
      throw new Error(`Topaz download lookup failed: ${lookup.status}`);
    }
    return {
      output: (await lookup.json()) as Record<string, unknown>,
      requestId: processId
    };
  }

  private async runVideoJob(
    endpoint: TopazEndpoint,
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const { video, ...createBody } = req.input;
    if (!(video instanceof Uint8Array) || video.byteLength === 0) {
      throw new Error("Topaz video endpoints need the source bytes in input.video");
    }
    const signal = req.signal;
    const jsonHeaders = this.headers({ "Content-Type": "application/json" });

    // 1. Create request. POST: a single attempt.
    const create = await fetchWithRetry(
      endpoint.submit,
      this.init(
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(createBody) },
        signal
      )
    );
    if (!create.ok) {
      throw new Error(
        `Topaz create failed: ${create.status} ${await create.text()}`
      );
    }
    const createJson = (await create.json()) as Record<string, unknown>;
    const requestId = (createJson.requestId ?? createJson.id) as
      | string
      | undefined;
    if (!requestId) {
      throw new Error(`No request ID returned: ${JSON.stringify(createJson)}`);
    }
    await recordGenerationReceiptAsync({ provider_request_id: requestId });

    // 2. Accept → multipart upload URLs. PATCH: a single attempt.
    const accept = await fetchWithRetry(
      endpoint.accept.replace("{request_id}", requestId),
      this.init({ method: "PATCH", headers: this.headers() }, signal)
    );
    if (!accept.ok) {
      throw new Error(
        `Topaz accept failed: ${accept.status} ${await accept.text()}`
      );
    }
    const acceptJson = (await accept.json()) as Record<string, unknown>;
    // Spec: { uploadId, urls[] }. Tolerate legacy shapes.
    const uploadId = (acceptJson.uploadId ?? acceptJson.upload_id) as
      | string
      | undefined;
    const uploadUrls = (acceptJson.urls ??
      acceptJson.uploadUrls ??
      (acceptJson.uploadUrl ? [acceptJson.uploadUrl] : [])) as string[];
    if (!uploadUrls.length) {
      throw new Error(`No upload URL returned: ${JSON.stringify(acceptJson)}`);
    }

    // 3. PUT the bytes, one equal part per presigned URL. A presigned PUT is
    // safe to retry. The URLs come out of the accept body, so every hop is
    // screened.
    const size = video.byteLength;
    const partSize = Math.max(1, Math.ceil(size / uploadUrls.length));
    const source = isRecord(createBody.source) ? createBody.source : {};
    const contentType = topazContainerContentType(
      typeof source.container === "string" ? source.container : null
    );
    const uploadResults: Array<{ partNum: number; eTag: string }> = [];
    for (let i = 0; i < uploadUrls.length; i++) {
      const start = i * partSize;
      // Equal ceil-sized parts can leave trailing URLs with no bytes (9 bytes
      // across 4 URLs → 3/3/3/0). Stop once the source is consumed rather than
      // PUT an empty part, which the API rejects.
      if (start >= size) break;
      // Checked before the retry loop, which would retry a refusal as a
      // network error.
      assertSafePublicHttpsUrl(uploadUrls[i]);
      const put = await fetchWithRetry(
        uploadUrls[i],
        this.init(
          {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: video.slice(start, Math.min(start + partSize, size))
          },
          signal
        ),
        { fetchImpl: (url, init) => safeFetch(String(url), init) }
      );
      if (!put.ok) {
        throw new Error(`Topaz upload part ${i + 1} failed: ${put.status}`);
      }
      uploadResults.push({
        partNum: i + 1,
        eTag: (put.headers.get("ETag") ?? "").replace(/"/g, "")
      });
    }

    // 4. Complete upload, echoing the uploadId from accept when present.
    const completeBody = uploadId ? { uploadId, uploadResults } : { uploadResults };
    const complete = await fetchWithRetry(
      endpoint.complete.replace("{request_id}", requestId),
      this.init(
        { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(completeBody) },
        signal
      )
    );
    if (!complete.ok) {
      throw new Error(
        `Topaz complete-upload failed: ${complete.status} ${await complete.text()}`
      );
    }

    // 5. Poll. The final body carries `download.url`.
    const output = await this.pollStatus(
      endpoint.status.replace("{request_id}", requestId),
      endpoint,
      signal,
      req.onProgress
    );
    return { output, requestId };
  }

  // Image status: Pending | Processing | Completed | Cancelled | Failed.
  // Video status: requested | accepted | initializing | preprocessing |
  // processing | postprocessing | complete | canceling | canceled | failed.
  // The shared terminal sets cover both after lowercasing.
  private async pollStatus(
    url: string,
    endpoint: Pick<TopazEndpoint, "pollInterval" | "maxAttempts">,
    signal?: AbortSignal,
    onProgress?: EndpointCallRequest["onProgress"]
  ): Promise<Record<string, unknown>> {
    const options: PollUntilTerminalOptions<Record<string, unknown>> = {
      intervalMs: endpoint.pollInterval,
      maxAttempts: endpoint.maxAttempts,
      onFailure: (data) =>
        new Error(`Topaz job failed: ${JSON.stringify(data)}`),
      onTimeout: () =>
        new Error(
          `Topaz job did not complete within ${endpoint.maxAttempts} poll attempts`
        )
    };
    if (signal) options.signal = signal;
    return pollUntilTerminal<Record<string, unknown>>(async () => {
      const res = await fetchWithRetry(url, this.init({ headers: this.headers() }, signal));
      if (!res.ok) throw new Error(`Topaz status poll failed: ${res.status}`);
      const body = (await res.json()) as Record<string, unknown>;
      if (onProgress && typeof body.status === "string") {
        onProgress({ message: body.status });
      }
      return body;
    }, options);
  }

  private init(init: RequestInit, signal?: AbortSignal): RequestInit {
    return signal ? { ...init, signal } : init;
  }
}
