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
 * into the matching media ref. This keeps the package dependency-free — it only
 * needs `fetch` and `Buffer`, both available in the Node runtime.
 */

export const HF_ROUTER = "https://router.huggingface.co";

/** Default model suggestions surfaced in node descriptions, per task. */
export const HF_TOKEN_SETTING = "HF_TOKEN";

/** Resolve the Hugging Face access token from node secrets or the environment. */
export function getHfToken(secrets: Record<string, string> | undefined): string {
  const key =
    secrets?.HF_TOKEN ||
    secrets?.HUGGINGFACE_API_KEY ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    "";
  if (!key) {
    throw new Error(
      "HF_TOKEN is not configured. Add a Hugging Face access token with " +
        "'Inference Providers' permission in Settings → API Keys."
    );
  }
  return key;
}

/** A media reference (image/audio/video) as it arrives on a node property. */
export interface MediaRef {
  type?: string;
  uri?: string;
  data?: unknown;
  asset_id?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** True when a media ref actually carries bytes or a URI to fetch. */
export function isRefSet(ref: MediaRef | undefined | null): ref is MediaRef {
  return !!ref && (!!ref.uri || !!ref.data);
}

/** Read the raw bytes behind an image/audio/video ref (data URI, base64, or URL). */
export async function refToBytes(ref: MediaRef): Promise<Uint8Array> {
  const data = ref.data;
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === "string" && data.length > 0) {
    const base64 = data.startsWith("data:")
      ? data.slice(data.indexOf(",") + 1)
      : data;
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const uri = ref.uri;
  if (typeof uri === "string" && uri.length > 0) {
    if (uri.startsWith("data:")) {
      const base64 = uri.slice(uri.indexOf(",") + 1);
      return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`Failed to fetch media from ${uri}: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error("Media input is empty — provide an image/audio/video.");
}

/** Read a media ref as a base64 string (no `data:` prefix), as the API expects. */
export async function refToBase64(ref: MediaRef): Promise<string> {
  const bytes = await refToBytes(ref);
  return Buffer.from(bytes).toString("base64");
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
): Record<string, unknown> {
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
): Record<string, unknown> {
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
): Record<string, unknown> {
  const clean = base64.startsWith("data:")
    ? base64.slice(base64.indexOf(",") + 1)
    : base64;
  return { type: "image", data: clean, content_type: mimeType };
}

function authHeaders(token: string): Record<string, string> {
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

/** POST a pipeline task that returns JSON (classification, NLP, embeddings…). */
export async function hfPipelineJson<T = unknown>(
  token: string,
  model: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${HF_ROUTER}/hf-inference/models/${model}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw await hfError(res, model);
  }
  return (await res.json()) as T;
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
  body: Record<string, unknown>
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
    const json = (await res.json()) as unknown;
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

function extractBase64(json: unknown): string | null {
  if (typeof json === "string") return json;
  if (Array.isArray(json) && json.length > 0) return extractBase64(json[0]);
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["image", "video", "audio", "data", "b64_json", "generated_image"]) {
      const value = obj[key];
      if (typeof value === "string") return value.replace(/^data:[^,]+,/, "");
    }
  }
  return null;
}

function guessMimeFromJson(json: unknown): string | null {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (typeof obj["video"] === "string") return "video/mp4";
    if (typeof obj["audio"] === "string") return "audio/flac";
  }
  return null;
}

/** OpenAI-compatible chat completion via the HF router. */
export interface HfChatMessage {
  role: string;
  content: string;
}

export interface HfChatResult {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export async function hfChatCompletion(
  token: string,
  body: Record<string, unknown>
): Promise<HfChatResult> {
  const res = await fetch(`${HF_ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw await hfError(res, String(body.model ?? "chat"));
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: HfChatResult["usage"];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  return { content, ...(json.usage ? { usage: json.usage } : {}) };
}

/** Build a `parameters` object, dropping null/undefined entries. */
export function cleanParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  return out;
}
