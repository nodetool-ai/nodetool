/**
 * Shared helpers for the Hugging Face Inference Providers nodes.
 *
 * Every task node reaches the router through the runtime HuggingFaceProvider
 * with `context.callProviderEndpoint`, so the provider holds the token and
 * each call writes a generation record. The route is the task id:
 *   - `chat-completion` uses the OpenAI-compatible `/v1/chat/completions`.
 *   - Every other ("pipeline") task posts a `{ inputs, parameters }` body to
 *     `/hf-inference/models/{model}`.
 *
 * Binary-input tasks (image/audio in) send the media as a base64 string in
 * `inputs`. Binary-output tasks (image/video out) come back as bytes that we
 * wrap into the matching media ref. A caller-supplied media uri is read
 * through `fetchExternalMedia`, the shared egress policy
 * (`docs/url-egress-inventory.md`).
 */

import { isRecord, isString } from "@nodetool-ai/node-sdk";
import {
  fetchExternalMedia,
  type EndpointCallResult,
  type ProcessingContext
} from "@nodetool-ai/runtime";

/** The PROVIDER_IDS value of the runtime Hugging Face provider. */
export const HF_PROVIDER_ID = "huggingface";

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
 * receives. `refToBytes` needs only `resolveAssetBytes`, which resolves
 * NodeTool's own reference schemes (`asset://<id>`, `package://<pkg>/<path>`,
 * storage URIs).
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
  // A zero-length buffer is "no inline data": fall through to `uri`.
  if (data instanceof Uint8Array) {
    if (data.length > 0) {
      return data;
    }
  } else if (data != null && data.length > 0) {
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

/** A Hugging Face Inference Providers task id, the provider's endpoint route. */
export type HfTask =
  | "chat-completion"
  | "text-generation"
  | "summarization"
  | "translation"
  | "fill-mask"
  | "question-answering"
  | "table-question-answering"
  | "feature-extraction"
  | "text-classification"
  | "token-classification"
  | "zero-shot-classification"
  | "text-to-image"
  | "image-to-image"
  | "image-classification"
  | "image-segmentation"
  | "object-detection"
  | "automatic-speech-recognition"
  | "audio-classification"
  | "text-to-video";

type GenerationCapability = Parameters<
  ProcessingContext["callProviderEndpoint"]
>[0]["capability"];

/**
 * The capability each task's generation record carries. Text, classification
 * and detection tasks have no closer capability than `generate_message`.
 */
const TASK_CAPABILITY = {
  "chat-completion": "generate_message",
  "text-generation": "generate_message",
  summarization: "generate_message",
  translation: "generate_message",
  "fill-mask": "generate_message",
  "question-answering": "generate_message",
  "table-question-answering": "generate_message",
  "feature-extraction": "generate_embedding",
  "text-classification": "generate_message",
  "token-classification": "generate_message",
  "zero-shot-classification": "generate_message",
  "text-to-image": "text_to_image",
  "image-to-image": "image_to_image",
  "image-classification": "generate_message",
  "image-segmentation": "segment_image",
  "object-detection": "generate_message",
  "automatic-speech-recognition": "automatic_speech_recognition",
  "audio-classification": "generate_message",
  "text-to-video": "text_to_video"
} satisfies Record<HfTask, GenerationCapability>;

/** One task call: where it runs, which task and model, and its body. */
export interface HfTaskCall<Body> {
  /** The context the node's `process()` received. */
  context: ProcessingContext | undefined;
  /** The calling node's id, recorded on the generation. */
  nodeId?: string;
  task: HfTask;
  model: string;
  body: Body;
}

async function callTask(
  call: HfTaskCall<HfPipelineRequest | HfChatRequest>
): Promise<EndpointCallResult> {
  const { context } = call;
  if (!context) {
    throw new Error("Hugging Face nodes need a processing context to run");
  }
  const request: Parameters<ProcessingContext["callProviderEndpoint"]>[0] = {
    provider: HF_PROVIDER_ID,
    capability: TASK_CAPABILITY[call.task],
    model: call.model,
    route: call.task,
    input: { ...call.body }
  };
  if (call.nodeId) request.nodeId = call.nodeId;
  return context.callProviderEndpoint(request);
}

/**
 * Run a pipeline task that returns JSON (classification, NLP, embeddings…).
 *
 * The payload is returned as the JSON value it is — read it with `jsonObject`,
 * `jsonArray`, `jsonString` and `jsonNumber` rather than claiming a shape.
 */
export async function hfPipelineJson(
  call: HfTaskCall<HfPipelineRequest>
): Promise<HfJsonValue> {
  const { output } = await callTask(call);
  // SAFETY: the provider returns the parsed JSON body of a JSON task, and the
  // value domain of `JSON.parse` is exactly HfJsonValue.
  return output as HfJsonValue;
}

/** Result of a binary pipeline task (image/video generation). */
export interface HfBinaryResult {
  bytes: Uint8Array;
  mimeType: string;
}

/** Run a pipeline task that returns media bytes (text-to-image/video…). */
export async function hfPipelineBinary(
  call: HfTaskCall<HfPipelineRequest>
): Promise<HfBinaryResult> {
  const { output } = await callTask(call);
  // A media task answers `{ data, mimeType }` (HuggingFaceProvider.callEndpoint).
  if (!isRecord(output) || !(output.data instanceof Uint8Array)) {
    throw new Error(`Hugging Face returned no media for "${call.model}"`);
  }
  return {
    bytes: output.data,
    mimeType: isString(output.mimeType)
      ? output.mimeType
      : "application/octet-stream"
  };
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
  call: Omit<HfTaskCall<HfChatRequest>, "task" | "model">
): Promise<HfChatResult> {
  const { output } = await callTask({
    ...call,
    task: "chat-completion",
    model: call.body.model
  });
  // SAFETY: chat completion answers with JSON, see hfPipelineJson.
  const json = jsonObject(output as HfJsonValue);
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
