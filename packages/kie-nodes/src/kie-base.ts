/**
 * Shared Kie.ai node helpers: input uploads, the endpoint call, result
 * mapping and cost reporting. The transport (submit, poll, upload, download)
 * lives in the runtime `KieProvider`, reached through the processing context.
 */

import {
  getProvider,
  loadMediaRefBytes,
  registerCostReconciler,
  sniffMedia
} from "@nodetool-ai/runtime";
import type {
  EndpointCallResult,
  GenerationRequest,
  ProcessingContext
} from "@nodetool-ai/runtime";
import { imageRefFromBytes } from "@nodetool-ai/runtime/provider-transport";
import type { EncodedImageRef } from "@nodetool-ai/runtime/provider-transport";

const KIE = "kie";

function withTaskId(message: string, taskId: string): string {
  return `${message} (taskId: ${taskId})`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRemoteHttpUrl(uri: string | undefined): uri is string {
  return !!uri && /^https?:\/\//.test(uri);
}

function isLocalHttpUrl(uri: string): boolean {
  return (
    uri.includes("localhost") ||
    uri.includes("127.0.0.1") ||
    uri.includes("[::1]")
  );
}

function requireContext(
  context: ProcessingContext | undefined
): ProcessingContext {
  if (!context) throw new Error("KIE nodes need a processing context");
  return context;
}

type MediaKind = "image" | "audio" | "video";

/** The MIME type an upload declares when the bytes do not say. */
const NOMINAL_MIME: Record<MediaKind, string> = {
  image: "image/png",
  audio: "audio/mpeg",
  video: "video/mp4"
};

const KIND_LABEL: Record<MediaKind, string> = {
  image: "Image",
  audio: "Audio",
  video: "Video"
};

/**
 * Resolve a media ref and hand its bytes to KIE's file host, returning the URL
 * KIE reads. A public http(s) uri passes through untouched. The bytes go
 * through the canonical {@link loadMediaRefBytes}, which handles inline
 * `data`, `data:` URIs, `asset://<id>` references, storage URIs and local
 * http(s) URLs.
 */
async function uploadMediaInput(
  kind: MediaKind,
  ref: unknown,
  context: ProcessingContext | undefined
): Promise<string> {
  const label = KIND_LABEL[kind];
  if (!ref || typeof ref !== "object") throw new Error(`${label} is required`);
  const media = ref as Record<string, unknown>;
  const uri = media.uri as string | undefined;
  if (isRemoteHttpUrl(uri) && !isLocalHttpUrl(uri)) {
    return uri;
  }
  const bytes = await loadMediaRefBytes(media, context);
  if (!bytes) throw new Error(`${label} has no data or URI`);
  const ctx = requireContext(context);
  // Declare the container the bytes carry, so a JPEG is not announced as PNG.
  const sniffed = sniffMedia(bytes);
  const mimeType = sniffed?.kind === kind ? sniffed.mime : NOMINAL_MIME[kind];
  return ctx.uploadProviderMedia({
    provider: KIE,
    bytes,
    mimeType,
    signal: ctx.signal
  });
}

export function uploadImageInput(
  image: unknown,
  context?: ProcessingContext
): Promise<string> {
  return uploadMediaInput("image", image, context);
}

export function uploadAudioInput(
  audio: unknown,
  context?: ProcessingContext
): Promise<string> {
  return uploadMediaInput("audio", audio, context);
}

export function uploadVideoInput(
  video: unknown,
  context?: ProcessingContext
): Promise<string> {
  return uploadMediaInput("video", video, context);
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  // A library-picked or freshly-generated ref carries only `asset_id` (with an
  // empty `uri`); `loadMediaRefBytes` resolves it via the context, so treat a
  // non-empty `asset_id` as a source. `null`/`""` stay unset.
  return !!(r.data || r.uri || r.asset_id);
}

export { isRefSet };

export type KieExecuteResult = {
  data: string;
  items: string[];
  taskId: string;
  creditsConsumed?: number;
};

/** One KIE call as a node makes it. */
export interface KieExecuteRequest {
  /** The KIE model name. It also names the call on the generation record. */
  model: string;
  input: Record<string, unknown>;
  capability: GenerationRequest["capability"];
  /** The node id the generation record and cost row are keyed by. */
  nodeId?: string;
  /** Run through the Suno API at this path, e.g. `/api/v1/generate`. */
  sunoEndpoint?: string;
  /** Post once to this endpoint and read `data[responseIdKey]` from the answer. */
  directEndpoint?: string;
  responseIdKey?: string;
  /** Read `resultJson.resultObject[resultObjectKey]` as text instead of downloading. */
  resultObjectKey?: string;
}

/** The generation capability that names a KIE node's output on the ledger. */
export function kieCapability(
  outputType: string,
  useSuno = false
): GenerationRequest["capability"] {
  if (useSuno) return "text_to_music";
  switch (outputType) {
    case "video":
      return "text_to_video";
    case "audio":
      return "text_to_speech";
    case "image":
    default:
      // A text output (an Omni id, a resultObject string) has no closer
      // capability. The FAL pack defaults the same way.
      return "text_to_image";
  }
}

function kieRoute(req: KieExecuteRequest): string | undefined {
  if (req.directEndpoint) return `direct:${req.directEndpoint}`;
  if (req.sunoEndpoint) return `suno:${req.sunoEndpoint}`;
  return undefined;
}

function creditsOf(result: EndpointCallResult): number | undefined {
  const credits = result.metadata?.creditsConsumed;
  return typeof credits === "number" ? credits : undefined;
}

async function downloadResult(
  context: ProcessingContext,
  url: string,
  message: string
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await context.downloadProviderMedia({
      provider: KIE,
      url,
      signal: context.signal
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${message}: ${reason}`, { cause: err });
  }
  return Buffer.from(bytes).toString("base64");
}

/** Read the first result URL out of a finished `recordInfo` body. */
function jobResultUrl(output: Record<string, unknown>, taskId: string): string {
  const resultJsonStr = asRecord(output.data)?.resultJson as string;
  if (!resultJsonStr) throw new Error(withTaskId("No resultJson in response", taskId));
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error(withTaskId("No resultUrls in resultJson", taskId));
  return resultUrls[0];
}

function jobResultText(
  output: Record<string, unknown>,
  taskId: string,
  resultObjectKey: string
): string {
  const resultJsonStr = asRecord(output.data)?.resultJson as string;
  if (!resultJsonStr) throw new Error(withTaskId("No resultJson in response", taskId));
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultObject = asRecord(resultData.resultObject) ?? resultData;
  const value = resultObject[resultObjectKey];
  if (typeof value === "string" && value) {
    return value;
  }
  throw new Error(withTaskId(`No ${resultObjectKey} in resultJson`, taskId));
}

/**
 * Run one KIE call through `context.callProviderEndpoint`, which records the
 * generation, and map KIE's answer to the node's output: base64 media, the
 * text a result object names, or the id a direct endpoint returns.
 */
export async function kieExecute(
  context: ProcessingContext | undefined,
  req: KieExecuteRequest
): Promise<KieExecuteResult> {
  const ctx = requireContext(context);
  const call: Parameters<ProcessingContext["callProviderEndpoint"]>[0] = {
    provider: KIE,
    capability: req.capability,
    model: req.model,
    input: req.input,
    signal: ctx.signal
  };
  const route = kieRoute(req);
  if (route) call.route = route;
  if (req.nodeId) call.nodeId = req.nodeId;
  const result = await ctx.callProviderEndpoint(call);
  const output = asRecord(result.output) ?? {};
  const taskId = result.requestId ?? "";
  const creditsConsumed = creditsOf(result);

  if (req.directEndpoint) {
    const key = req.responseIdKey ?? "";
    const id = asRecord(output.data)?.[key];
    if (typeof id !== "string" || !id) {
      throw new Error(`No ${key} in response: ${JSON.stringify(output)}`);
    }
    return { data: id, items: [id], taskId: "" };
  }

  if (req.sunoEndpoint) {
    const sunoData = asRecord(asRecord(output.data)?.response)?.sunoData as
      | Array<Record<string, unknown>>
      | undefined;
    if (!sunoData?.length) throw new Error("No sunoData in Suno response");
    const audioUrl = sunoData[0].audioUrl as string;
    if (!audioUrl) throw new Error("No audioUrl in Suno response");
    const b64 = await downloadResult(ctx, audioUrl, "Failed to download audio");
    return { data: b64, items: [b64], taskId, creditsConsumed };
  }

  if (req.resultObjectKey) {
    const text = jobResultText(output, taskId, req.resultObjectKey);
    return { data: text, items: [text], taskId, creditsConsumed };
  }
  const url = jobResultUrl(output, taskId);
  const b64 = await downloadResult(
    ctx,
    url,
    withTaskId(`Failed to download from ${url}`, taskId)
  );
  return { data: b64, items: [b64], taskId, creditsConsumed };
}

/** Kie.ai advertises credits at $0.005 each. */
const KIE_USD_PER_CREDIT = 0.005;

export function reportKieProviderCost(
  context: unknown,
  creditsConsumed: number | undefined,
  taskId?: string | null
): void {
  if (creditsConsumed == null || !Number.isFinite(creditsConsumed)) return;
  const setter = (context as { setProviderCost?: unknown } | null | undefined)
    ?.setProviderCost;
  if (typeof setter === "function") {
    const usd = creditsConsumed * KIE_USD_PER_CREDIT;
    (
      setter as (
        p: string,
        a: number,
        u: string,
        details?: {
          billing_unit?: string;
          quantity?: number;
          unit_price?: number;
          currency?: string;
          provider_request_id?: string | null;
        }
      ) => void
    ).call(context, "kie", usd, "USD", {
      billing_unit: "credits",
      quantity: creditsConsumed,
      unit_price: KIE_USD_PER_CREDIT,
      currency: "USD",
      // The task id is what the reconciler looks the charge up by; without it
      // a kie row was never reconciled (design F4).
      provider_request_id: taskId ?? null
    });
  }
}

interface KieBillingProvider {
  fetchBillingCost(requestId: string): Promise<{ creditsConsumed: number } | null>;
}

function isKieBillingProvider(value: unknown): value is KieBillingProvider {
  return (
    typeof (value as Partial<KieBillingProvider> | null)?.fetchBillingCost ===
    "function"
  );
}

/**
 * Register the kie reconciler so the tracker can refine kie estimates. The
 * provider reads the task's billed credits with its own key; the credit price
 * stays here.
 */
export function registerKieCostReconciler(): void {
  registerCostReconciler(KIE, async ({ requestId, secrets }) => {
    const provider = await getProvider(KIE, (key) => secrets?.[key]);
    if (!isKieBillingProvider(provider)) return null;
    const billed = await provider.fetchBillingCost(requestId);
    if (!billed || !Number.isFinite(billed.creditsConsumed)) return null;
    return {
      cost: billed.creditsConsumed * KIE_USD_PER_CREDIT,
      currency: "USD",
      quantity: billed.creditsConsumed,
      unit_price: KIE_USD_PER_CREDIT
    };
  });
}

/** Build an ImageRef from the base64 image KIE returns. */
export function kieImageRef(base64: string): Promise<EncodedImageRef> {
  return imageRefFromBytes(new Uint8Array(Buffer.from(base64, "base64")));
}
