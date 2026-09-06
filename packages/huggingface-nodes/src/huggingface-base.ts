/**
 * Shared helpers for the Hugging Face Inference Providers nodes.
 *
 * All task nodes talk to the unified router at https://router.huggingface.co:
 *   - Chat completion uses the OpenAI-compatible `/v1/chat/completions` route.
 *   - Every other ("pipeline") task posts to
 *     `/hf-inference/models/{model}` with a `{ inputs, parameters }` body.
 *
 * Binary-input tasks (image/audio in) send the media as a base64 string in
 * `inputs`; binary-output tasks (image/video out) return raw bytes that we wrap
 * into the matching media ref. The only non-`fetch` dependency is
 * `fetchExternalMedia`, the shared egress policy a caller-supplied media uri
 * goes through (`docs/url-egress-inventory.md`).
 */

import { fetchExternalMedia } from "@nodetool-ai/runtime";

export const HF_ROUTER = "https://router.huggingface.co";

export const HF_TOKEN_SETTING = "HF_TOKEN";

/** Resolve the Hugging Face access token from node secrets or the environment. */
export function getHfToken(
  secrets: Record<string, string> | undefined
): string {
  const key =
    secrets?.HF_TOKEN ||
    secrets?.HUGGINGFACE_API_KEY ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    "";
  if (!key) {
    throw new Error(
      "HF_TOKEN is not configured. Add a Hugging Face access token with " +
        "'Inference Providers' permission in Settings → Models & Providers."
    );
  }
  return key;
}

/** A JSON value — exactly what `JSON.parse` can produce. */
export type HfJsonValue =
  | string
  | number
  | boolean
  | null
  | HfJsonValue[]
  | HfJsonObject;

/** A JSON object: string keys, JSON values. */
export interface HfJsonObject {
  [key: string]: HfJsonValue;
}

function isJsonObject(value: HfJsonValue | undefined): value is HfJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonString(value: HfJsonValue | undefined): value is string {
  return typeof value === "string";
}

/** The object at `value`, or an empty object when the payload is not one. */
export function jsonObject(value: HfJsonValue | undefined): HfJsonObject {
  return isJsonObject(value) ? value : {};
}

/** The array at `value`, or an empty array when the payload is not one. */
export function jsonArray(value: HfJsonValue | undefined): HfJsonValue[] {
  return Array.isArray(value) ? value : [];
}

/** `value` rendered as a string; a missing or null value becomes `""`. */
export function jsonString(value: HfJsonValue | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** `value` read as a number; a missing or null value becomes `0`. */
export function jsonNumber(value: HfJsonValue | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/**
 * The first element of an array payload, or the payload itself.
 *
 * Pipeline tasks return either the result or a one-element list holding it.
 */
export function jsonFirst(value: HfJsonValue | undefined): HfJsonValue {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** A media reference (image/audio/video) as it arrives on a node property. */
export interface MediaRef {
  type?: string;
  uri?: string;
  data?: string | Uint8Array | null;
  asset_id?: string | null;
  metadata?: HfJsonObject | null;
}

/** True when a media ref actually carries bytes or a URI to fetch. */
export function isRefSet(ref: MediaRef | undefined | null): ref is MediaRef {
  return !!ref && (!!ref.uri || !!ref.data);
}

/**
 * Minimal structural view of the ProcessingContext that a node's `process()`
 * receives. We only need `resolveAssetBytes` here, which resolves NodeTool's
 * own reference schemes (`asset://<id>`, `package://<pkg>/<path>`, storage
 * URIs). Typed structurally to keep this package free of a `@nodetool-ai/runtime`
 * dependency.
 */
export type AssetResolveContext =
  | {
      resolveAssetBytes?: (
        uri: string
      ) => Promise<{ bytes: Uint8Array | null }>;
    }
  | undefined;

/** Read the raw bytes behind an image/audio/video ref (data URI, base64, or URL). */
export async function refToBytes(
  ref: MediaRef,
  context?: AssetResolveContext
): Promise<Uint8Array> {
  const data = ref.data;
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data != null && data.length > 0) {
    const base64 = data.startsWith("data:")
      ? data.slice(data.indexOf(",") + 1)
      : data;
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const uri = ref.uri;
  if (uri != null && uri.length > 0) {
    if (uri.startsWith("data:")) {
      const base64 = uri.slice(uri.indexOf(",") + 1);
      return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const isHttp = uri.startsWith("http://") || uri.startsWith("https://");
    // NodeTool reference schemes (asset://, package://) and storage URIs are
    // not fetchable directly — resolve them through the ProcessingContext.
    if (!isHttp && context?.resolveAssetBytes) {
      const { bytes } = await context.resolveAssetBytes(uri);
      if (bytes) {
        return bytes;
      }
      throw new Error(`Failed to resolve media from ${uri}`);
    }
    if (isHttp) {
      // Caller-supplied media uri — the media-ref egress policy decides.
      const res = await fetchExternalMedia(uri);
      if (!res.ok) {
        throw new Error(`Failed to fetch media from ${uri}: ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    }
  }
  throw new Error("Media input is empty — provide an image/audio/video.");
}

/** Read a media ref as a base64 string (no `data:` prefix), as the API expects. */
export async function refToBase64(
  ref: MediaRef,
  context?: AssetResolveContext
): Promise<string> {
  const bytes = await refToBytes(ref, context);
  return Buffer.from(bytes).toString("base64");
}

/** An image ref as a node emits it: raw base64 bytes plus their mime type. */
export interface ImageRefOutput {
  type: "image";
  data: string;
  content_type: string;
}

/** A video ref as a node emits it: raw base64 bytes, mime type and container. */
export interface VideoRefOutput {
  type: "video";
  data: string;
  content_type: string;
  format: string;
}

/**
 * Wrap generated image bytes into an ImageRef-shaped output.
 *
 * `data` is RAW base64 (no `data:` prefix); the MIME type goes in
 * `content_type`. Asset-saving (`decodeAssetBytes`) and provider forwarding
 * (`asUint8Array`) decode `data` directly with `Buffer.from(data, "base64")`,
 * so a `data:` prefix would corrupt the bytes.
 */
export function imageRefFromBytes(
  bytes: Uint8Array,
  mimeType = "image/png"
): ImageRefOutput {
  return {
    type: "image",
    data: Buffer.from(bytes).toString("base64"),
    content_type: mimeType
  };
}

/** Wrap generated video bytes into a VideoRef-shaped output (raw base64 `data`). */
export function videoRefFromBytes(
  bytes: Uint8Array,
  mimeType = "video/mp4"
): VideoRefOutput {
  return {
    type: "video",
    data: Buffer.from(bytes).toString("base64"),
    content_type: mimeType,
    format: mimeType.split("/")[1] ?? "mp4"
  };
}

/** Wrap a base64 PNG mask (as returned by segmentation) into an ImageRef. */
export function imageRefFromBase64(
  base64: string,
  mimeType = "image/png"
): ImageRefOutput {
  const clean = base64.startsWith("data:")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  return { type: "image", data: clean, content_type: mimeType };
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Extract a useful error message from a failed HF response. */
async function hfError(res: Response, model: string): Promise<Error> {
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* response body already consumed or unavailable */
  }
  return new Error(
    `Hugging Face inference failed for "${model}" (${res.status}): ${detail || res.statusText}`
  );
}

/** Read a response body as JSON. */
async function readJson(res: Response): Promise<HfJsonValue> {
  // SAFETY: `Response.json()` resolves to the value `JSON.parse` produced, and
  // that value domain is exactly HfJsonValue — string, number, boolean, null,
  // array, or object of those. No shape beyond that is claimed here.
  return (await res.json()) as HfJsonValue;
}

/** Provider parameters for a pipeline task. Entries with no value are dropped. */
export interface HfParameters {
  [key: string]: HfJsonValue | undefined;
}

/** Body of a pipeline request: the task `inputs` plus provider parameters. */
export interface HfPipelineRequest {
  inputs: HfJsonValue;
  parameters?: HfParameters;
  options?: HfParameters;
}

/**
 * POST a pipeline task that returns JSON (classification, NLP, embeddings…).
 *
 * The payload is returned as the JSON value it is — read it with `jsonObject`,
 * `jsonArray`, `jsonString` and `jsonNumber` rather than claiming a shape.
 */
export async function hfPipelineJson(
  token: string,
  model: string,
  body: HfPipelineRequest
): Promise<HfJsonValue> {
  const res = await fetch(`${HF_ROUTER}/hf-inference/models/${model}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw await hfError(res, model);
  }
  return readJson(res);
}

/** Result of a binary pipeline task (image/video generation). */
export interface HfBinaryResult {
  bytes: Uint8Array;
  mimeType: string;
}

/** POST a pipeline task that returns raw media bytes (text-to-image/video…). */
export async function hfPipelineBinary(
  token: string,
  model: string,
  body: HfPipelineRequest
): Promise<HfBinaryResult> {
  const res = await fetch(`${HF_ROUTER}/hf-inference/models/${model}`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      Accept: "image/png, video/mp4, application/octet-stream"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw await hfError(res, model);
  }
  const contentType = res.headers.get("content-type") ?? "";
  // Some providers return a JSON envelope with a base64 payload instead of raw
  // bytes. Handle both so the caller always gets decoded media.
  if (contentType.includes("application/json")) {
    const json = await readJson(res);
    const base64 = extractBase64(json);
    if (!base64) {
      throw new Error(
        `Hugging Face returned JSON without media for "${model}": ${JSON.stringify(json).slice(0, 200)}`
      );
    }
    return {
      bytes: new Uint8Array(Buffer.from(base64, "base64")),
      mimeType: guessMimeFromJson(json) ?? "image/png"
    };
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mimeType: contentType || "application/octet-stream"
  };
}

function extractBase64(json: HfJsonValue): string | null {
  if (isJsonString(json)) return json;
  if (Array.isArray(json) && json.length > 0) {
    return extractBase64(json[0] ?? null);
  }
  if (isJsonObject(json)) {
    for (const key of [
      "image",
      "video",
      "audio",
      "data",
      "b64_json",
      "generated_image"
    ]) {
      const value = json[key];
      if (isJsonString(value)) return value.replace(/^data:[^,]+,/, "");
    }
  }
  return null;
}

function guessMimeFromJson(json: HfJsonValue): string | null {
  if (isJsonObject(json)) {
    if (isJsonString(json["video"])) return "video/mp4";
    if (isJsonString(json["audio"])) return "audio/flac";
  }
  return null;
}

/** OpenAI-compatible chat completion via the HF router. */
export interface HfChatMessage {
  role: string;
  content: string;
}

/** Body of a chat-completion request. */
export interface HfChatRequest {
  model: string;
  messages: HfChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

function optionalNumber(value: HfJsonValue | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

export interface HfChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface HfChatResult {
  content: string;
  usage?: HfChatUsage;
}

export async function hfChatCompletion(
  token: string,
  body: HfChatRequest
): Promise<HfChatResult> {
  const res = await fetch(`${HF_ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw await hfError(res, body.model || "chat");
  }
  const json = jsonObject(await readJson(res));
  const choice = jsonObject(jsonArray(json["choices"])[0]);
  const result: HfChatResult = {
    content: jsonString(jsonObject(choice["message"])["content"])
  };
  const usage = json["usage"];
  if (isJsonObject(usage)) {
    result.usage = {
      prompt_tokens: optionalNumber(usage["prompt_tokens"]),
      completion_tokens: optionalNumber(usage["completion_tokens"]),
      total_tokens: optionalNumber(usage["total_tokens"])
    };
  }
  return result;
}

/** Build a `parameters` object, dropping null/undefined/empty entries. */
export function cleanParams(params: HfParameters): HfParameters {
  const out: HfParameters = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  return out;
}
