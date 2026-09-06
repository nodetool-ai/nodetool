import type { Chunk } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import { geminiContextExceeded } from "./context-exceeded.js";
import { sniffAudioMime } from "./audio-mime.js";
import { sniffVideoMime } from "./video-mime.js";
import { safeFetch } from "./safe-url.js";
import {
  ContentFilterRefusal,
  isContentFilterRefusal
} from "./content-filter.js";
import {
  isBoolean,
  isFiniteNumber,
  isNonEmptyString,
  isString
} from "@nodetool-ai/protocol";

const log = createLogger("nodetool.runtime.providers.gemini");
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageContent,
  MessageAudioContent,
  MessageImageContent,
  MessageTextContent,
  MessageVideoContent,
  ProviderStreamItem,
  ProviderTool,
  StreamingAudioChunk,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel
} from "./types.js";
import { WEB_SEARCH_TOOL_NAME } from "./types.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_UPLOAD_BASE = `${GEMINI_API_BASE.replace(
  "/v1beta",
  ""
)}/upload/v1beta/files`;

/**
 * Largest payload sent as `inlineData`. Gemini caps a generateContent request
 * at 20 MB total; anything above this goes through the Files API instead, which
 * leaves room for the rest of the request.
 */
export const GEMINI_INLINE_VIDEO_MAX_BYTES = 19 * 1024 * 1024;

/** Polls of `files/{name}` before an uploaded file is declared stuck. */
const GEMINI_FILE_MAX_POLLS = 60;
const GEMINI_FILE_POLL_INTERVAL_MS = 2_000;

/** Drop `; charset=…`/`; codecs=…` parameters from a Content-Type header. */
function stripMimeParams(value: string | null): string | undefined {
  const mime = value?.split(";")[0].trim();
  return mime || undefined;
}

/**
 * Normalize an audio mime to one Gemini's `inlineData` accepts. Gemini lists
 * audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg and audio/flac; the
 * common `audio/mpeg` label is remapped to `audio/mp3`. Falls back to
 * `audio/mp3` when the type is unknown.
 */
function geminiAudioMime(mime: string | undefined): string {
  if (!mime) return "audio/mp3";
  if (mime === "audio/mpeg" || mime === "audio/mpga") return "audio/mp3";
  return mime;
}

interface GeminiProviderOptions {
  fetchFn?: typeof fetch;
  /** Delay between Files API polls — overridden in tests to run them back to back. */
  sleepFn?: (ms: number) => Promise<void>;
}

/** A file record returned by the Gemini Files API. */
interface GeminiFile {
  name?: string;
  uri?: string;
  mimeType?: string;
  state?: string;
  error?: { message?: string };
}

/** A Gemini content part. */
export interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: { id?: string; name: string; response: unknown };
  /** Thought signature — at part level, camelCase per Gemini API. */
  thoughtSignature?: string;
}

/** A Gemini content entry (role + parts). */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Shape of Gemini generateContent / streamGenerateContent request body. */
interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<
    | { functionDeclarations: Array<Record<string, unknown>> }
    | { googleSearch: Record<string, never> }
    | { codeExecution: Record<string, never> }
  >;
  toolConfig?: {
    functionCallingConfig?: { mode: "ANY"; allowedFunctionNames?: string[] };
    /**
     * Required by Gemini when a built-in tool (googleSearch, codeExecution) is
     * sent alongside functionDeclarations — the API 400s without it.
     */
    includeServerSideToolInvocations?: boolean;
  };
  generationConfig?: Record<string, unknown>;
}

/** A single candidate in a Gemini response. */
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

/** Top-level Gemini response shape. */
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

/** Shape of a model entry from the Gemini models list API. */
interface GeminiModelEntry {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsPage {
  models?: GeminiModelEntry[];
  nextPageToken?: string;
}

/**
 * Veo reports a content-filtered take by counting it out of the response
 * rather than by failing the operation: `raiMediaFilteredCount` rises, the
 * reasons list carries the support codes, and `generatedSamples` comes back
 * short — or empty, when every take was filtered.
 */
interface GeminiRaiFilterFields {
  raiMediaFilteredCount?: number;
  raiMediaFilteredReasons?: string[];
}

interface GeminiVideoOperation {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number; status?: string };
  response?: GeminiRaiFilterFields & {
    generateVideoResponse?: GeminiRaiFilterFields & {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
}

// Gemini's function-declaration schema is a strict subset of OpenAPI 3.0.
// It rejects JSON-Schema-only fields like `const`, `additionalProperties`,
// `$schema`, `$ref`, `definitions`, `patternProperties`, etc. Any one of these
// anywhere in the tree causes a 400 that aborts the entire tool batch, so we
// recursively strip them before sending. Zod 4's `z.toJSONSchema` (draft
// 2020-12) emits several of them — `const` for every `z.literal()`, `$ref` +
// `$defs` for every reused schema — so tools defined in Zod hit this.
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "$comment",
  "definitions",
  "patternProperties",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
  "dependentSchemas",
  "dependentRequired",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "const",
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "prefixItems",
  "additionalItems",
  "contains",
  "minContains",
  "maxContains",
  "uniqueItems",
  "multipleOf",
  "examples",
  "readOnly",
  "writeOnly",
  "deprecated",
  "contentEncoding",
  "contentMediaType"
]);

/** Keywords whose value is data, not a schema — never recurse into them. */
const GEMINI_DATA_KEYS = new Set([
  "enum",
  "const",
  "default",
  "example",
  "examples"
]);

function isArraySchemaType(type: unknown): boolean {
  if (isString(type)) return type.toLowerCase() === "array";
  if (Array.isArray(type)) {
    return type.some(
      (t) => isString(t) && t.toLowerCase() === "array"
    );
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The JSON Schema type name for a primitive literal, if it has one. */
function primitiveSchemaType(value: unknown): string | undefined {
  if (isString(value)) return "string";
  if (isBoolean(value)) return "boolean";
  if (isFiniteNumber(value)) {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return undefined;
}

function resolveJsonPointer(
  root: unknown,
  pointer: string
) {
  if (pointer === "#" || pointer === "") return { found: true, value: root };
  if (!pointer.startsWith("#/")) return { found: false, value: undefined };
  let cursor: unknown = root;
  for (const rawSegment of pointer.slice(2).split("/")) {
    const segment = decodeURIComponent(rawSegment)
      .replace(/~1/g, "/")
      .replace(/~0/g, "~");
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return { found: false, value: undefined };
      }
      cursor = cursor[index];
      continue;
    }
    if (!isPlainObject(cursor) || !(segment in cursor)) {
      return { found: false, value: undefined };
    }
    cursor = cursor[segment];
  }
  return { found: true, value: cursor };
}

/**
 * Inline local `$ref`s so dropping `$defs` doesn't leave empty schemas behind.
 * A ref that is cyclic or unresolvable degrades to a permissive object.
 */
/**
 * One node of a JSON Schema document: an object of nodes, a list of nodes, or
 * a scalar. This is the domain the three walkers below rewrite.
 */
type SchemaNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | SchemaNode[]
  | { [key: string]: SchemaNode };

function inlineGeminiRefs(
  node: unknown,
  root: unknown,
  seen: ReadonlySet<string>
): SchemaNode {
  if (Array.isArray(node)) {
    return node.map((item) => inlineGeminiRefs(item, root, seen));
  }
  // SAFETY: a schema node that is neither a list nor an object is a JSON
  // scalar — this walker is only ever handed a decoded JSON Schema.
  if (!isPlainObject(node)) return node as SchemaNode;

  if (isString(node.$ref)) {
    const { $ref, ...rest } = node;
    if (seen.has($ref)) return { type: "object", ...rest };
    const { found, value } = resolveJsonPointer(root, $ref);
    if (!found || !isPlainObject(value)) return { type: "object", ...rest };
    // SAFETY: both inputs are objects, so both results are objects too.
    const resolved = inlineGeminiRefs(
      value,
      root,
      new Set([...seen, $ref])
    ) as {
      [key: string]: SchemaNode;
    };
    // SAFETY: as above.
    const overrides = inlineGeminiRefs(rest, root, seen) as {
      [key: string]: SchemaNode;
    };
    return { ...resolved, ...overrides };
  }

  const out: { [key: string]: SchemaNode } = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = GEMINI_DATA_KEYS.has(key)
      ? // SAFETY: a data key's value is carried through verbatim; it is part of
        // the same decoded JSON Schema.
        (value as SchemaNode)
      : inlineGeminiRefs(value, root, seen);
  }
  return out;
}

/** Fold `allOf` members into the parent schema; parent keys win. */
function mergeAllOf(
  out: { [key: string]: SchemaNode },
  members: unknown[]
): { [key: string]: SchemaNode } {
  for (const member of members) {
    const sanitized = sanitizeSchemaNode(member);
    if (!isPlainObject(sanitized)) continue;
    for (const [key, value] of Object.entries(sanitized)) {
      if (key === "properties" && isPlainObject(value)) {
        // SAFETY: both sides are `properties` maps of the same schema.
        out.properties = {
          ...(value as { [key: string]: SchemaNode }),
          ...((out.properties as { [key: string]: SchemaNode }) ?? {})
        };
        continue;
      }
      if (key === "required" && Array.isArray(value)) {
        const existing = Array.isArray(out.required) ? out.required : [];
        out.required = [...new Set([...existing, ...value])];
        continue;
      }
      if (out[key] === undefined) out[key] = value;
    }
  }
  return out;
}

function sanitizeSchemaNode(value: unknown): SchemaNode {
  if (Array.isArray(value)) return value.map(sanitizeSchemaNode);
  // SAFETY: as in `inlineGeminiRefs` — a non-list, non-object node is a scalar.
  if (!isPlainObject(value)) return value as SchemaNode;

  const out: { [key: string]: SchemaNode } = {};
  for (const [key, nested] of Object.entries(value)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && isPlainObject(nested)) {
      const properties: { [key: string]: SchemaNode } = {};
      // Property *names* are data — a property called "const" must survive.
      for (const [name, sub] of Object.entries(nested)) {
        properties[name] = sanitizeSchemaNode(sub);
      }
      out.properties = properties;
      continue;
    }
    if (key === "items") {
      out.items = sanitizeSchemaNode(
        Array.isArray(nested) ? (nested[0] ?? { type: "string" }) : nested
      );
      continue;
    }
    if (key === "anyOf" && Array.isArray(nested)) {
      out.anyOf = nested.map(sanitizeSchemaNode);
      continue;
    }
    out[key] = GEMINI_DATA_KEYS.has(key)
      ? // SAFETY: a data key's value is carried through verbatim; it is part of
        // the same decoded JSON Schema.
        (nested as SchemaNode)
      : sanitizeSchemaNode(nested);
  }

  // `oneOf` means the same thing to a model as `anyOf`, which Gemini accepts.
  if (out.anyOf === undefined && Array.isArray(value.oneOf)) {
    out.anyOf = value.oneOf.map(sanitizeSchemaNode);
  }
  if (Array.isArray(value.allOf)) mergeAllOf(out, value.allOf);

  // `const` is what Zod emits for a literal. A single-value `enum` says the
  // same thing in Gemini's dialect, but only for strings — its `enum` is a
  // list of strings — so other literals keep the constraint in the description.
  if (value.const !== undefined && out.enum === undefined) {
    const literalType = primitiveSchemaType(value.const);
    if (literalType === "string") {
      // SAFETY: `primitiveSchemaType` proved the literal is a string.
      out.enum = [value.const as string];
      out.type ??= "string";
    } else if (literalType) {
      out.type ??= literalType;
      const hint = `Must be ${JSON.stringify(value.const)}.`;
      out.description =
        isNonEmptyString(out.description)
          ? `${out.description} ${hint}`
          : hint;
    }
  }

  // Gemini's `type` is one string; JSON Schema allows a union. `["x","null"]`
  // is Zod's optional/nullable shape and maps onto `nullable`.
  if (Array.isArray(out.type)) {
    const named = out.type.filter(
      (t): t is string => typeof t === "string" && t.toLowerCase() !== "null"
    );
    if (named.length < out.type.length) out.nullable = true;
    if (named.length > 0) out.type = named[0];
    else delete out.type;
  }

  // Gemini rejects an array schema that omits `items` ("items: missing
  // field"). JSON Schema allows it, so backfill a permissive default.
  if (isArraySchemaType(out.type) && out.items === undefined) {
    out.items = { type: "string" };
  }
  return out;
}

function sanitizeGeminiSchema(value: unknown): SchemaNode {
  return sanitizeSchemaNode(inlineGeminiRefs(value, value, new Set()));
}

function sanitizeToolName(name: string): string {
  let sanitized = (name ?? "").trim();
  sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, "_");
  sanitized = sanitized.replace(/_+/g, "_");
  if (!sanitized) sanitized = "_tool";
  if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = `_${sanitized}`;
  if (sanitized.length > 64) sanitized = sanitized.slice(0, 64);
  if (!sanitized) sanitized = "_tool";
  return sanitized;
}

function appendGeminiContent(
  contents: GeminiContent[],
  content: GeminiContent
): void {
  const previous = contents[contents.length - 1];
  if (previous?.role === content.role) {
    previous.parts.push(...content.parts);
  } else {
    contents.push(content);
  }
}

/**
 * Sentinel Gemini accepts in place of a real thought signature. Gemini 3
 * rejects a request whose history replays a function call with no signature —
 * which is every turn recorded before signatures were persisted, and every
 * call a caller injected by hand. The documented escape hatch is this literal:
 * https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
 * Reasoning continuity is lost for that call, so it is only ever a fallback
 * for a signature we do not have.
 */
const GEMINI_UNSIGNED_CALL_SENTINEL = "skip_thought_signature_validator";

/**
 * Gemini validates that the *first* functionCall part of each model turn
 * carries a signature. Stamp the sentinel on any that reaches us without one
 * so an unsigned history fails soft (degraded reasoning) instead of 400.
 */
function signUnsignedFunctionCalls(contents: GeminiContent[]): void {
  for (const content of contents) {
    if (content.role !== "model") continue;
    const first = content.parts.find((p) => p.functionCall !== undefined);
    if (first && !first.thoughtSignature) {
      first.thoughtSignature = GEMINI_UNSIGNED_CALL_SENTINEL;
    }
  }
}

function geminiResponseError(data: GeminiResponse): Error | null {
  if (data.error?.message)
    return new Error(`Gemini API error: ${data.error.message}`);
  if (data.promptFeedback?.blockReason) {
    const detail = data.promptFeedback.blockReasonMessage
      ? `: ${data.promptFeedback.blockReasonMessage}`
      : "";
    return new Error(
      `Gemini prompt blocked (${data.promptFeedback.blockReason})${detail}`
    );
  }
  return null;
}

function parseGeminiResponse(value: unknown): GeminiResponse {
  if (!isPlainObject(value)) {
    throw new Error("Gemini returned an invalid response envelope");
  }
  const response = value as GeminiResponse;
  if (
    response.candidates !== undefined &&
    !Array.isArray(response.candidates)
  ) {
    throw new Error("Gemini returned invalid candidates");
  }
  for (const candidate of response.candidates ?? []) {
    if (
      candidate.content?.parts !== undefined &&
      !Array.isArray(candidate.content.parts)
    ) {
      throw new Error("Gemini returned invalid candidate parts");
    }
  }
  return response;
}

/** What a decoded `generateContent` body carries for the caller to shape. */
export interface DecodedGeminiGeneration {
  parts: GeminiPart[];
  finishReason: string | null;
  usage: GeminiResponse["usageMetadata"];
}

/**
 * Decode a `:generateContent` body: validate the envelope, raise the API's own
 * error or block reason, and return the first candidate's parts.
 *
 * The live contract probe and the checked-in raw-response fixtures
 * (`packages/runtime/tests/fixtures/provider-contract/`) run this same
 * function, so a wire change surfaces here rather than only on a real call.
 */
export function decodeGeminiGenerateContent(
  value: unknown
): DecodedGeminiGeneration {
  const data = parseGeminiResponse(value);
  const dataError = geminiResponseError(data);
  if (dataError) throw dataError;
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error("Gemini returned no candidates");
  }
  return {
    parts: candidate.content.parts,
    finishReason: candidate.finishReason ?? null,
    usage: data.usageMetadata
  };
}

/**
 * Decode one page of `GET /models`. Throws when the page carries no `models`
 * array; {@link GeminiProvider.getAvailableLanguageModels} treats that the same
 * way it treats an unreachable listing.
 */
export function decodeGeminiModelsPage(value: unknown): GeminiModelsPage {
  if (!isPlainObject(value)) {
    throw new Error("Gemini model page is not an object");
  }
  const page = value as GeminiModelsPage;
  if (!Array.isArray(page.models)) {
    throw new Error("Gemini model page has no `models` array");
  }
  return page;
}

function normalizeEmbedding(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? values.map((value) => value / norm) : values;
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Aborted", "AbortError");
}

async function* decodeGeminiSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<GeminiResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw abortError(signal);
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      if (done && buffer.trim()) {
        events.push(buffer);
        buffer = "";
      }
      for (const eventText of events) {
        const data = eventText
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
          .trim();
        if (!data || data === "[DONE]") continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch (error) {
          throw new Error("Gemini returned malformed SSE JSON", {
            cause: error
          });
        }
        if (!isPlainObject(parsed)) {
          throw new Error("Gemini returned an invalid SSE event");
        }
        yield parseGeminiResponse(parsed);
      }
      if (done) break;
    }
  } finally {
    // Stop the underlying connection whenever the consumer bails early (abort
    // or `break`); releasing the lock alone leaves the HTTP body undrained.
    await reader
      .cancel(signal?.aborted ? signal.reason : undefined)
      .catch(() => undefined);
    reader.releaseLock();
  }
}

export class GeminiProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["GEMINI_API_KEY"];
  }

  readonly apiKey: string;
  private _fetch: typeof fetch;
  private _sleep: (ms: number) => Promise<void>;

  constructor(
    secrets: { GEMINI_API_KEY?: string },
    options: GeminiProviderOptions = {}
  ) {
    super("gemini");

    const apiKey = secrets.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }

    this.apiKey = apiKey;
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this._sleep =
      options.sleepFn ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  getContainerEnv() {
    return { GEMINI_API_KEY: this.apiKey };
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override get supportsNativeWebSearch(): boolean {
    return true;
  }

  /** Gemini reads a whole clip: see {@link videoContentToGeminiPart}. */
  override get supportsVideoInput(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Model listing
  // ---------------------------------------------------------------------------

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const items: GeminiModelEntry[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const query = new URLSearchParams({
          key: this.apiKey,
          pageSize: "1000"
        });
        if (pageToken) query.set("pageToken", pageToken);
        const response = await this._fetch(
          `${GEMINI_API_BASE}/models?${query}`
        );
        if (!response.ok) return [];
        const payload = decodeGeminiModelsPage(await response.json());
        items.push(...(payload.models ?? []));
        pageToken = payload.nextPageToken;
      } while (pageToken);
    } catch {
      return [];
    }

    const seen = new Set<string>();
    return items
      .filter((m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .filter((m) => !!m.name)
      .filter(
        (m) => !/(embedding|aqa|imagen|veo|image|tts)/i.test(m.name ?? "")
      )
      .map((m) => {
        const id = (m.name as string).split("/").pop() as string;
        if (seen.has(id)) return null;
        seen.add(id);
        return {
          id,
          name: m.displayName ?? id,
          provider: "gemini"
        };
      })
      .filter((model): model is LanguageModel => model !== null);
  }

  // ---------------------------------------------------------------------------
  // Message conversion helpers
  // ---------------------------------------------------------------------------

  private async messageContentToGeminiPart(
    content: MessageContent
  ): Promise<GeminiPart> {
    if (content.type === "text") {
      return { text: (content as MessageTextContent).text };
    }

    if (content.type === "image_url") {
      const img = (content as MessageImageContent).image;
      let base64Data: string;
      let mimeType = img.mimeType ?? "image/jpeg";

      const parseImageDataUri = (uri: string): string => {
        const idx = uri.indexOf(",");
        if (idx < 0) throw new Error("Invalid image data URI");
        const header = uri.slice(5, idx);
        mimeType = header.split(";")[0] || mimeType;
        return uri.slice(idx + 1);
      };

      if (
        isNonEmptyString(img.data) ||
        (img.data instanceof Uint8Array && img.data.length > 0)
      ) {
        if (isString(img.data)) {
          // Inline data may itself be a data: URI — strip the prefix and take
          // the real mime type from it rather than shipping the header as
          // base64 payload.
          base64Data = img.data.startsWith("data:")
            ? parseImageDataUri(img.data)
            : img.data;
        } else {
          base64Data = Buffer.from(img.data).toString("base64");
        }
      } else if (img.uri) {
        // resolveUri turns asset file:// URIs (what the chat pipeline produces)
        // into data: URIs; http(s) URIs pass through to safeFetch.
        const resolvedUri = img.uri.startsWith("data:")
          ? img.uri
          : await this.resolveUri(img.uri);
        if (resolvedUri.startsWith("data:")) {
          base64Data = parseImageDataUri(resolvedUri);
        } else {
          const resp = await safeFetch(resolvedUri, undefined, 5, this._fetch);
          if (!resp.ok)
            throw new Error(`Failed to fetch image: ${resp.status}`);
          mimeType =
            stripMimeParams(resp.headers.get("content-type")) ?? mimeType;
          base64Data = Buffer.from(await resp.arrayBuffer()).toString("base64");
        }
      } else {
        base64Data = "";
      }

      return { inlineData: { mimeType, data: base64Data } };
    }

    if (content.type === "audio") {
      const aud = (content as MessageAudioContent).audio;
      let base64Data: string;
      let mimeType = aud.mimeType;

      const parseAudioDataUri = (uri: string): string => {
        const idx = uri.indexOf(",");
        if (idx < 0) throw new Error("Invalid audio data URI");
        const header = uri.slice(5, idx);
        mimeType = mimeType ?? header.split(";")[0];
        return uri.slice(idx + 1);
      };

      if (
        isNonEmptyString(aud.data) ||
        (aud.data instanceof Uint8Array && aud.data.length > 0)
      ) {
        if (isString(aud.data)) {
          base64Data = aud.data.startsWith("data:")
            ? parseAudioDataUri(aud.data)
            : aud.data;
          mimeType =
            mimeType ?? sniffAudioMime(Buffer.from(base64Data, "base64"));
        } else {
          const bytes = Buffer.from(aud.data);
          base64Data = bytes.toString("base64");
          mimeType = mimeType ?? sniffAudioMime(bytes);
        }
      } else if (aud.uri) {
        const resolvedUri = aud.uri.startsWith("data:")
          ? aud.uri
          : await this.resolveUri(aud.uri);
        if (resolvedUri.startsWith("data:")) {
          base64Data = parseAudioDataUri(resolvedUri);
        } else {
          const resp = await safeFetch(resolvedUri, undefined, 5, this._fetch);
          if (!resp.ok)
            throw new Error(`Failed to fetch audio: ${resp.status}`);
          const bytes = Buffer.from(await resp.arrayBuffer());
          mimeType =
            stripMimeParams(resp.headers.get("content-type")) ??
            mimeType ??
            sniffAudioMime(bytes);
          base64Data = bytes.toString("base64");
        }
      } else {
        base64Data = "";
      }

      return {
        inlineData: { mimeType: geminiAudioMime(mimeType), data: base64Data }
      };
    }

    if (content.type === "video") {
      return await this.videoContentToGeminiPart(
        (content as MessageVideoContent).video
      );
    }

    return { text: "[unsupported content type]" };
  }

  /**
   * Source a video's bytes the way the image and audio branches do, then send
   * them inline when small enough and through the Files API when not.
   */
  private async videoContentToGeminiPart(
    video: MessageVideoContent["video"]
  ): Promise<GeminiPart> {
    let bytes: Buffer;
    let mimeType = video.mimeType;

    const parseVideoDataUri = (uri: string): Buffer => {
      const idx = uri.indexOf(",");
      if (idx < 0) throw new Error("Invalid video data URI");
      const header = uri.slice(5, idx);
      mimeType = mimeType ?? stripMimeParams(header.split(";base64")[0]);
      return Buffer.from(uri.slice(idx + 1), "base64");
    };

    if (
      isNonEmptyString(video.data) ||
      (video.data instanceof Uint8Array && video.data.length > 0)
    ) {
      if (isString(video.data)) {
        bytes = video.data.startsWith("data:")
          ? parseVideoDataUri(video.data)
          : Buffer.from(video.data, "base64");
      } else {
        bytes = Buffer.from(video.data);
      }
    } else if (video.uri) {
      const resolvedUri = video.uri.startsWith("data:")
        ? video.uri
        : await this.resolveUri(video.uri);
      if (resolvedUri.startsWith("data:")) {
        bytes = parseVideoDataUri(resolvedUri);
      } else {
        const resp = await safeFetch(resolvedUri, undefined, 5, this._fetch);
        if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
        mimeType =
          stripMimeParams(resp.headers.get("content-type")) ?? mimeType;
        bytes = Buffer.from(await resp.arrayBuffer());
      }
    } else {
      bytes = Buffer.alloc(0);
    }

    const resolvedMime = mimeType ?? sniffVideoMime(bytes);

    if (bytes.length > GEMINI_INLINE_VIDEO_MAX_BYTES) {
      const fileUri = await this.uploadFileToGemini(bytes, resolvedMime);
      return { fileData: { mimeType: resolvedMime, fileUri } };
    }

    return {
      inlineData: { mimeType: resolvedMime, data: bytes.toString("base64") }
    };
  }

  /**
   * Upload bytes with the Files API resumable protocol and wait until the file
   * is ACTIVE — Gemini rejects a `fileData` part that references a file still
   * being processed. Returns the file's uri.
   */
  private async uploadFileToGemini(
    bytes: Uint8Array,
    mimeType: string
  ): Promise<string> {
    const startResp = await this._fetch(
      `${GEMINI_UPLOAD_BASE}?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(bytes.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          file: { display_name: `nodetool-upload.${mimeType.split("/")[1]}` }
        })
      }
    );
    if (!startResp.ok) {
      const errText = await startResp.text();
      throw new Error(
        `Gemini file upload failed to start ${startResp.status}: ${errText}`
      );
    }
    const uploadUrl = startResp.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("Gemini file upload returned no X-Goog-Upload-URL");
    }

    const uploadResp = await this._fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(bytes.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize"
      },
      body: new Blob([new Uint8Array(bytes) as Uint8Array<ArrayBuffer>], {
        type: mimeType
      })
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      throw new Error(
        `Gemini file upload failed ${uploadResp.status}: ${errText}`
      );
    }

    const uploaded = (await uploadResp.json()) as { file?: GeminiFile };
    let file = uploaded.file;
    if (!file?.name || !file.uri) {
      throw new Error("Gemini file upload returned no file record");
    }
    const fileUri = file.uri;
    const fileName = file.name;

    for (let poll = 0; poll < GEMINI_FILE_MAX_POLLS; poll++) {
      if (file?.state === "ACTIVE") return fileUri;
      if (file?.state === "FAILED") {
        throw new Error(
          `Gemini file processing failed: ${file.error?.message ?? "unknown error"}`
        );
      }
      await this._sleep(GEMINI_FILE_POLL_INTERVAL_MS);
      const pollResp = await this._fetch(`${GEMINI_API_BASE}/${fileName}`, {
        headers: { "x-goog-api-key": this.apiKey }
      });
      if (!pollResp.ok) {
        const errText = await pollResp.text();
        throw new Error(`Gemini file poll failed ${pollResp.status}: ${errText}`);
      }
      file = (await pollResp.json()) as GeminiFile;
    }

    if (file?.state === "ACTIVE") return fileUri;
    throw new Error(`Gemini file ${fileName} did not become ACTIVE in time`);
  }

  /**
   * Convert our Message array into Gemini contents + optional system instruction.
   */
  async convertMessages(
    messages: Message[],
    nameMap: ReadonlyMap<string, string> = new Map()
  ): Promise<{ contents: GeminiContent[]; systemInstruction?: string }> {
    let systemInstruction: string | undefined;
    const contents: GeminiContent[] = [];

    // Gemini correlates a tool result to its call by the function *name*, not
    // by id (and our tool-call ids are synthesized — never valid Gemini
    // function names). Map each tool-call id back to its function name so the
    // `functionResponse.name` below matches the earlier `functionCall.name`.
    const toolCallNames = new Map<string, string>();
    for (const m of messages) {
      if (m.role === "assistant" && m.toolCalls) {
        for (const tc of m.toolCalls) {
          if (tc.id) toolCallNames.set(tc.id, nameMap.get(tc.name) ?? tc.name);
        }
      }
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        const instruction =
          isString(msg.content)
            ? msg.content
            : (msg.content ?? [])
                .filter((c): c is MessageTextContent => c.type === "text")
                .map((c) => c.text)
                .join(" ");
        systemInstruction = systemInstruction
          ? `${systemInstruction}\n${instruction}`
          : instruction;
        continue;
      }

      if (msg.role === "tool") {
        // Tool result → user role with functionResponse part. The name must
        // match the originating functionCall's name, resolved from the call id.
        const responseText =
          isString(msg.content)
            ? msg.content
            : JSON.stringify(msg.content);

        const functionName =
          (msg.toolCallId ? toolCallNames.get(msg.toolCallId) : undefined) ??
          msg.toolCallId ??
          "unknown";

        const responsePart: GeminiPart = {
          functionResponse: {
            name: functionName,
            id: msg.toolCallId ?? undefined,
            response: { result: responseText }
          }
        };

        // Merge parallel tool results into a single user turn so the request
        // keeps alternating user/model roles.
        const prev = contents[contents.length - 1];
        if (
          prev &&
          prev.role === "user" &&
          prev.parts.length > 0 &&
          prev.parts.every((p) => p.functionResponse !== undefined)
        ) {
          prev.parts.push(responsePart);
        } else {
          appendGeminiContent(contents, {
            role: "user",
            parts: [responsePart]
          });
        }
        continue;
      }

      if (msg.role === "assistant") {
        // If we have raw Gemini parts (with thought content), replay them exactly
        if (msg._rawGeminiParts && Array.isArray(msg._rawGeminiParts)) {
          // Copy: the contents we build get merged and stamped below, and the
          // message's own parts must survive that untouched for the next turn.
          appendGeminiContent(contents, {
            role: "model",
            parts: (msg._rawGeminiParts as GeminiPart[]).map((part) => ({
              ...part
            }))
          });
          continue;
        }

        const parts: GeminiPart[] = [];

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            const part: GeminiPart = {
              functionCall: {
                id: tc.id,
                name: nameMap.get(tc.name) ?? tc.name,
                args: tc.args
              }
            };
            if (tc.thought_signature) {
              part.thoughtSignature = tc.thought_signature;
            }
            parts.push(part);
          }
        }

        if (isNonEmptyString(msg.content)) {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            parts.push(await this.messageContentToGeminiPart(c));
          }
        }

        if (parts.length > 0) {
          appendGeminiContent(contents, { role: "model", parts });
        }
        continue;
      }

      const parts: GeminiPart[] = [];
      if (isString(msg.content)) {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          parts.push(await this.messageContentToGeminiPart(c));
        }
      }
      if (parts.length > 0) {
        appendGeminiContent(contents, { role: "user", parts });
      }
    }

    signUnsignedFunctionCalls(contents);

    return { contents, systemInstruction };
  }

  formatTools(tools: ProviderTool[]) {
    const nameMap = new Map<string, string>();
    const reverseMap = new Map<string, string>();
    const usedNames = new Set<string>();
    const declarations: Array<Record<string, unknown>> = [];

    for (const tool of tools) {
      if (
        tool.name === WEB_SEARCH_TOOL_NAME ||
        tool.type === "code_interpreter"
      ) {
        continue;
      }
      const original = tool.name;
      let unique = sanitizeToolName(original);

      let suffix = 2;
      while (usedNames.has(unique)) {
        const sfx = `_${suffix}`;
        unique = `${sanitizeToolName(original).slice(0, 64 - sfx.length)}${sfx}`;
        suffix++;
      }

      usedNames.add(unique);
      nameMap.set(original, unique);
      reverseMap.set(unique, original);

      const rawParameters = tool.inputSchema ?? {
        type: "object",
        properties: {}
      };
      declarations.push({
        name: unique,
        description: tool.description ?? "",
        parameters: sanitizeGeminiSchema(rawParameters) as Record<
          string,
          unknown
        >
      });
    }

    return {
      geminiTools:
        declarations.length > 0 ? [{ functionDeclarations: declarations }] : [],
      nameMap,
      reverseMap
    };
  }

  /**
   * Fill in `tools` and `toolConfig` on a request body.
   *
   * Built-in tools (googleSearch, codeExecution) run server side. When they are
   * combined with functionDeclarations, Gemini rejects the request unless
   * `toolConfig.includeServerSideToolInvocations` is set — the built-in calls
   * and their results have to be echoed back into the conversation for the
   * function-calling loop to stay coherent.
   */
  private applyTools(
    body: GeminiRequest,
    tools: ProviderTool[],
    geminiTools: Array<{
      functionDeclarations: Array<Record<string, unknown>>;
    }>,
    nameMap: Map<string, string>,
    toolChoice?: string | "any"
  ): void {
    if (geminiTools.length > 0) {
      body.tools = geminiTools;
    }

    let hasBuiltIn = false;
    if (tools.some((tool) => tool.name === WEB_SEARCH_TOOL_NAME)) {
      body.tools = [...(body.tools ?? []), { googleSearch: {} }];
      hasBuiltIn = true;
    }
    if (tools.some((tool) => tool.type === "code_interpreter")) {
      body.tools = [...(body.tools ?? []), { codeExecution: {} }];
      hasBuiltIn = true;
    }

    const toolConfig: NonNullable<GeminiRequest["toolConfig"]> = {};

    if (hasBuiltIn && geminiTools.length > 0) {
      toolConfig.includeServerSideToolInvocations = true;
    }

    if (
      toolChoice &&
      (toolChoice === "any" ? geminiTools.length > 0 : nameMap.has(toolChoice))
    ) {
      const selected =
        toolChoice === "any"
          ? undefined
          : (nameMap.get(toolChoice) ?? sanitizeToolName(toolChoice));
      type FunctionCallingConfigFields = {
        mode: "ANY";
        allowedFunctionNames?: string[];
      };
      const functionCallingConfig: FunctionCallingConfigFields = {
        mode: "ANY"
      };
      if (selected) {
        functionCallingConfig.allowedFunctionNames = [selected];
      }
      toolConfig.functionCallingConfig = functionCallingConfig;
    }

    if (Object.keys(toolConfig).length > 0) {
      body.toolConfig = toolConfig;
    }
  }

  // ---------------------------------------------------------------------------
  // Non-streaming generation
  // ---------------------------------------------------------------------------

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    signal?: AbortSignal;
  }): Promise<Message> {
    const {
      model,
      tools = [],
      maxTokens = 16384,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty
    } = args;

    const { geminiTools, nameMap, reverseMap } = this.formatTools(tools);
    const { contents, systemInstruction } = await this.convertMessages(
      args.messages,
      nameMap
    );

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    this.applyTools(body, tools, geminiTools, nameMap, args.toolChoice);

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
    if (presencePenalty != null)
      generationConfig.presencePenalty = presencePenalty;
    if (frequencyPenalty != null)
      generationConfig.frequencyPenalty = frequencyPenalty;
    body.generationConfig = generationConfig;

    log.debug("Gemini request", { model });

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    this.recordRequestPayload(body);
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: args.signal
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Gemini request failed", {
        model,
        error: `${response.status}: ${text.slice(0, 200)}`
      });
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    const decoded = decodeGeminiGenerateContent(await response.json());

    this.trackGeminiUsage(model, decoded.usage);

    return this.extractMessage(decoded.parts, reverseMap);
  }

  /** Record token usage from a Gemini usageMetadata block (if present). */
  private trackGeminiUsage(
    model: string,
    usage: GeminiResponse["usageMetadata"]
  ): void {
    if (!usage) return;
    this.trackUsage(model, {
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens:
        (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      cachedTokens: usage.cachedContentTokenCount ?? 0
    });
  }

  // ---------------------------------------------------------------------------
  // Streaming generation
  // ---------------------------------------------------------------------------

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const {
      model,
      tools = [],
      maxTokens = 16384,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty
    } = args;

    const { geminiTools, nameMap, reverseMap } = this.formatTools(tools);
    const { contents, systemInstruction } = await this.convertMessages(
      args.messages,
      nameMap
    );

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    this.applyTools(body, tools, geminiTools, nameMap, args.toolChoice);

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
    if (presencePenalty != null)
      generationConfig.presencePenalty = presencePenalty;
    if (frequencyPenalty != null)
      generationConfig.frequencyPenalty = frequencyPenalty;
    body.generationConfig = generationConfig;

    log.debug("Gemini request", { model });

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    this.recordRequestPayload(body);
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: args.signal
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("Gemini request failed", {
        model,
        error: `${response.status}: ${text.slice(0, 200)}`
      });
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    if (!response.body) {
      throw new Error("Gemini streaming response has no body");
    }

    // Accumulate all parts across SSE events for raw replay.
    // Gemini thinking models emit thought parts and function calls across
    // separate SSE events, but they must all be sent back together.
    const allParts: GeminiPart[] = [];
    const pendingToolCalls: ToolCall[] = [];
    // Gemini SSE reports CUMULATIVE usageMetadata; keep the last one seen and
    // record it once after the stream (accumulating each event would over-count).
    let lastUsage: GeminiResponse["usageMetadata"];

    for await (const event of decodeGeminiSse(response.body, args.signal)) {
      const eventError = geminiResponseError(event);
      if (eventError) throw eventError;
      if (event.usageMetadata) lastUsage = event.usageMetadata;

      const parts = event.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        allParts.push(part);

        if (part.text !== undefined && !part.thought) {
          const chunk: Chunk = {
            type: "chunk",
            content: part.text,
            done: false
          };
          yield chunk;
        } else if (part.functionCall) {
          const originalName =
            reverseMap.get(part.functionCall.name) ?? part.functionCall.name;
          const toolCall: ToolCall = {
            id:
              part.functionCall.id ??
              `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: originalName,
            args: part.functionCall.args ?? {}
          };
          if (part.thoughtSignature) {
            toolCall.thought_signature = part.thoughtSignature;
          }
          pendingToolCalls.push(toolCall);
        }
      }
    }

    this.trackGeminiUsage(model, lastUsage);

    // Attach accumulated raw parts to tool calls for thought replay
    const hasThoughts = allParts.some((p) => p.thought || p.thoughtSignature);
    for (const tc of pendingToolCalls) {
      if (hasThoughts) {
        tc._rawGeminiParts = allParts;
      }
      yield tc;
    }

    // Emit synthetic done chunk
    const doneChunk: Chunk = {
      type: "chunk",
      content: "",
      done: true
    };
    yield doneChunk;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractMessage(
    parts: GeminiPart[],
    reverseMap: Map<string, string>
  ): Message {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text !== undefined && !part.thought) {
        textParts.push(part.text);
      } else if (part.functionCall) {
        const originalName =
          reverseMap.get(part.functionCall.name) ?? part.functionCall.name;
        const tc: ToolCall = {
          id:
            part.functionCall.id ??
            `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: originalName,
          args: part.functionCall.args ?? {}
        };
        if (part.thoughtSignature) {
          tc.thought_signature = part.thoughtSignature;
        }
        toolCalls.push(tc);
      }
    }

    const hasThoughts = parts.some((p) => p.thought || p.thoughtSignature);
    const msg: Message = {
      role: "assistant",
      content: textParts.join("") || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
    if (hasThoughts) {
      msg._rawGeminiParts = parts;
    }
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Model listing — image, TTS, ASR, video, embedding
  // ---------------------------------------------------------------------------

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image",
        provider: "gemini",
        supportedTasks: ["text_to_image", "image_to_image"],
        aspectRatios: [
          "1:1",
          "2:3",
          "3:2",
          "3:4",
          "4:3",
          "4:5",
          "5:4",
          "9:16",
          "16:9",
          "21:9"
        ],
        resolutions: ["1K", "2K", "4K"]
      },
      {
        id: "gemini-3.1-flash-lite-image",
        name: "Gemini 3.1 Flash-Lite Image",
        provider: "gemini",
        supportedTasks: ["text_to_image", "image_to_image"],
        aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"]
      },
      {
        id: "gemini-3-pro-image",
        name: "Gemini 3 Pro Image",
        provider: "gemini",
        supportedTasks: ["text_to_image", "image_to_image"],
        aspectRatios: [
          "1:1",
          "2:3",
          "3:2",
          "3:4",
          "4:3",
          "4:5",
          "5:4",
          "9:16",
          "16:9",
          "21:9"
        ],
        resolutions: ["1K", "2K", "4K"]
      },
      {
        id: "imagen-4.0-generate-001",
        name: "Imagen 4",
        provider: "gemini",
        supportedTasks: ["text_to_image"],
        aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"]
      }
    ];
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    const voices = [
      "Zephyr",
      "Puck",
      "Charon",
      "Kore",
      "Fenrir",
      "Leda",
      "Orus",
      "Aoede",
      "Callirrhoe",
      "Autonoe",
      "Enceladus",
      "Iapetus",
      "Umbriel",
      "Algieba",
      "Despina",
      "Erinome",
      "Algenib",
      "Rasalgethi",
      "Laomedeia",
      "Achernar",
      "Alnilam",
      "Schedar",
      "Gacrux",
      "Pulcherrima",
      "Achird",
      "Zubenelgenubi",
      "Vindemiatrix",
      "Sadachbia",
      "Sadaltager",
      "Sulafat"
    ];
    return [
      {
        id: "gemini-3.1-flash-tts-preview",
        name: "Gemini 3.1 Flash TTS Preview",
        provider: "gemini",
        voices
      },
      {
        id: "gemini-2.5-flash-preview-tts",
        name: "Gemini 2.5 Flash TTS",
        provider: "gemini",
        voices
      },
      {
        id: "gemini-2.5-pro-preview-tts",
        name: "Gemini 2.5 Pro TTS",
        provider: "gemini",
        voices
      }
    ];
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      {
        // The transcription-specific model. It answers `generateContent`, so
        // it runs through the same path as the general models below.
        id: "gemini-3.5-transcribe",
        name: "Gemini 3.5 Transcribe",
        provider: "gemini"
      },
      {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        provider: "gemini"
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash-Lite",
        provider: "gemini"
      }
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "veo-3.1-generate-preview",
        name: "Veo 3.1 Preview",
        provider: "gemini",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "veo-3.1-fast-generate-preview",
        name: "Veo 3.1 Fast Preview",
        provider: "gemini",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "veo-3.1-lite-generate-preview",
        name: "Veo 3.1 Lite Preview",
        provider: "gemini",
        supportedTasks: ["text_to_video", "image_to_video"]
      }
    ];
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [
      {
        id: "gemini-embedding-2",
        name: "Gemini Embedding 2",
        provider: "gemini",
        dimensions: 3072
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const { text, model, dimensions } = args;
    if (!text || (Array.isArray(text) && text.length === 0)) {
      throw new Error("text must not be empty");
    }

    const texts = isString(text) ? [text] : text;

    // Gemini embedContent supports a single content; batch by calling per text
    const embeddings: number[][] = [];
    for (const t of texts) {
      const body: Record<string, unknown> = {
        content: { parts: [{ text: t }] }
      };
      if (dimensions) {
        body.outputDimensionality = dimensions;
      }

      const url = `${GEMINI_API_BASE}/models/${model}:embedContent?key=${this.apiKey}`;
      const response = await this._fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini embedding error ${response.status}: ${errText}`
        );
      }

      const data = (await response.json()) as {
        embedding?: { values?: number[] };
      };
      if (!data.embedding?.values) {
        throw new Error("No embedding returned from Gemini API");
      }
      embeddings.push(
        dimensions && dimensions < 3072
          ? normalizeEmbedding(data.embedding.values)
          : data.embedding.values
      );
    }

    return embeddings;
  }

  // ---------------------------------------------------------------------------
  // Text-to-image
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;

    if (modelId.startsWith("gemini-")) {
      // Use generateContent with IMAGE response modality
      const imageConfig: Record<string, unknown> = {};
      if (params.aspectRatio) imageConfig.aspectRatio = params.aspectRatio;
      if (params.resolution) imageConfig.imageSize = params.resolution;
      type GenerationConfigFields = {
        responseModalities: string[];
        imageConfig?: typeof imageConfig;
      };
      const generationConfig: GenerationConfigFields = {
        responseModalities: ["IMAGE", "TEXT"]
      };
      if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
      }
      const body = {
        contents: [{ role: "user" as const, parts: [{ text: params.prompt }] }],
        generationConfig
      };

      const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`;
      const response = await this._fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Gemini text-to-image failed ${response.status}: ${errText}`
        );
      }

      const data = parseGeminiResponse(await response.json());
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error("No candidates in response");

      for (const part of parts) {
        if (part.inlineData?.data) {
          return Uint8Array.from(Buffer.from(part.inlineData.data, "base64"));
        }
      }
      throw new Error("No image data returned in response");
    }

    // Imagen models use the predict endpoint.
    const parameters: Record<string, unknown> = { sampleCount: 1 };
    if (params.aspectRatio) parameters.aspectRatio = params.aspectRatio;
    if (params.seed != null) parameters.seed = params.seed;
    if (params.safetyCheck === false)
      parameters.safetyFilterLevel = "block_only_high";
    const body: Record<string, unknown> = {
      instances: [{ prompt: params.prompt }],
      parameters
    };

    const url = `${GEMINI_API_BASE}/models/${modelId}:predict?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image generation failed ${response.status}: ${errText}`
      );
    }

    const data = (await response.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string }>;
      generatedImages?: Array<{ image?: { imageBytes?: string } }>;
    };

    // Try predictions format first (Vertex-style), then generatedImages
    const b64 =
      data.predictions?.[0]?.bytesBase64Encoded ??
      data.generatedImages?.[0]?.image?.imageBytes;

    if (!b64) throw new Error("No image data in response");
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  // ---------------------------------------------------------------------------
  // Image-to-image
  // ---------------------------------------------------------------------------

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("gemini-")) {
      throw new Error(
        `Model ${modelId} does not support image-to-image. Only gemini-* models supported.`
      );
    }

    const imageParts = images
      .filter((b) => b && b.length > 0)
      .map((b) => ({
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from(b).toString("base64")
        }
      }));
    if (imageParts.length === 0) {
      throw new Error("At least one input image is required");
    }

    const imageConfig: Record<string, unknown> = {};
    if (params.aspectRatio) imageConfig.aspectRatio = params.aspectRatio;
    if (params.resolution) imageConfig.imageSize = params.resolution;
    type GenerationConfigFields2 = {
      responseModalities: string[];
      imageConfig?: typeof imageConfig;
    };
    const generationConfig: GenerationConfigFields2 = {
      responseModalities: ["IMAGE", "TEXT"]
    };
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }
    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: params.prompt }, ...imageParts]
        }
      ],
      generationConfig
    };

    const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image-to-image failed ${response.status}: ${errText}`
      );
    }

    const data = parseGeminiResponse(await response.json());
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No candidates in response");

    for (const part of parts) {
      if (part.inlineData?.data) {
        return Uint8Array.from(Buffer.from(part.inlineData.data, "base64"));
      }
    }
    throw new Error("No image data returned in response");
  }

  // ---------------------------------------------------------------------------
  // Text-to-speech
  // ---------------------------------------------------------------------------

  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    /** Ignored — Gemini returns raw PCM; backend wraps/encodes to honor. */
    audioFormat?: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    const { text, model, voice = "Puck" } = args;

    const body = {
      contents: [{ role: "user" as const, parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini TTS failed ${response.status}: ${errText}`);
    }

    const data = parseGeminiResponse(await response.json());
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No audio in response");

    for (const part of parts) {
      if (part.inlineData?.data) {
        const raw = Buffer.from(part.inlineData.data, "base64");
        // Gemini TTS returns raw PCM int16 at 24kHz
        const samples = new Int16Array(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength / 2
        );
        yield { samples };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Automatic speech recognition
  // ---------------------------------------------------------------------------

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
  }): Promise<import("./types.js").ASRResult> {
    const { audio, model, language, temperature = 0 } = args;

    if (!audio || audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    if (audio.length > 20 * 1024 * 1024) {
      throw new Error(
        "Gemini inline audio is limited to 20 MB; upload the audio with the File API first"
      );
    }

    // Detect MIME type from the audio header.
    let mimeType = geminiAudioMime(sniffAudioMime(audio));
    if (
      audio[0] === 0x52 &&
      audio[1] === 0x49 &&
      audio[2] === 0x46 &&
      audio[3] === 0x46
    ) {
      mimeType = "audio/wav";
    } else if (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
      mimeType = "audio/mp3";
    } else if (audio[0] === 0xff && (audio[1] === 0xfb || audio[1] === 0xf3)) {
      mimeType = "audio/mp3";
    } else if (
      audio[0] === 0x66 &&
      audio[1] === 0x4c &&
      audio[2] === 0x61 &&
      audio[3] === 0x43
    ) {
      mimeType = "audio/flac";
    } else if (
      audio[0] === 0x4f &&
      audio[1] === 0x67 &&
      audio[2] === 0x67 &&
      audio[3] === 0x53
    ) {
      mimeType = "audio/ogg";
    }

    let promptText = args.prompt ?? "Transcribe this audio to text.";
    if (language) {
      promptText = `${promptText} The audio is in ${language}.`;
    }

    const audioBase64 = Buffer.from(audio).toString("base64");

    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: promptText }
          ]
        }
      ],
      generationConfig: {
        temperature
      }
    };

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini ASR failed ${response.status}: ${errText}`);
    }

    const data = parseGeminiResponse(await response.json());
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) return { text: "" };

    const text = parts
      .filter((p) => p.text !== undefined)
      .map((p) => p.text!)
      .join("");
    return { text };
  }

  private buildVideoParameters(
    params: TextToVideoParams | ImageToVideoParams
  ) {
    const parameters: Record<string, unknown> = {};
    if (params.negativePrompt) {
      parameters.negativePrompt = params.negativePrompt;
    }
    if (params.aspectRatio) {
      parameters.aspectRatio = params.aspectRatio;
    }
    if (params.resolution) {
      parameters.resolution = params.resolution;
    }
    if (params.durationSeconds != null) {
      parameters.durationSeconds = params.durationSeconds;
    }
    if (params.seed != null) {
      parameters.seed = params.seed;
    }
    return parameters;
  }

  private getVideoUri(operation: GeminiVideoOperation): string | undefined {
    return (
      operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video
        ?.uri ?? operation.response?.generatedVideos?.[0]?.video?.uri
    );
  }

  /**
   * The refusal to raise when an operation came back with no video, or null
   * when nothing says the filter is why. A filtered take leaves the operation
   * successful and the samples empty, so without this the caller sees only
   * "No video URI in response" — indistinguishable from a broken response, and
   * fatal to a run that has already paid for its other shots.
   */
  private videoContentFilterRefusal(
    operation: GeminiVideoOperation,
    modelId: string
  ): ContentFilterRefusal | null {
    const rai = operation.response?.generateVideoResponse ?? operation.response;
    const reasons = rai?.raiMediaFilteredReasons ?? [];
    const filtered = rai?.raiMediaFilteredCount ?? 0;
    if (filtered <= 0 && reasons.length === 0) return null;
    const detail = reasons.length
      ? reasons.join("; ")
      : "no reason given by the provider";
    return new ContentFilterRefusal(
      `Veo filtered every generated video for this prompt: ${detail}`,
      { provider: "gemini", model: modelId, reasons }
    );
  }

  private async waitForVideoOperation(
    operation: GeminiVideoOperation,
    timeoutSeconds?: number | null,
    signal?: AbortSignal
  ): Promise<GeminiVideoOperation> {
    const maxWait =
      timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 600_000;
    const pollInterval = 10_000;
    let elapsed = 0;
    let current = operation;

    while (!current.done && elapsed < maxWait) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(abortError(signal));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, pollInterval);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      elapsed += pollInterval;

      if (!current.name) {
        throw new Error("No operation name for polling");
      }
      const pollResp = await this._fetch(`${GEMINI_API_BASE}/${current.name}`, {
        headers: { "x-goog-api-key": this.apiKey },
        signal
      });
      if (!pollResp.ok) {
        const errText = await pollResp.text();
        throw new Error(`Poll failed ${pollResp.status}: ${errText}`);
      }
      current = (await pollResp.json()) as GeminiVideoOperation;
    }

    if (!current.done) {
      throw new Error("Video generation timed out");
    }
    if (current.error?.message) {
      // Vertex answers a filtered prompt through the operation's error slot
      // ("videos were filtered out because they violated ... usage
      // guidelines"), so the refusal has to be recognized here too.
      if (isContentFilterRefusal(current.error.message)) {
        throw new ContentFilterRefusal(current.error.message, {
          provider: "gemini"
        });
      }
      throw new Error(
        `Gemini video generation failed: ${current.error.message}`
      );
    }
    return current;
  }

  private async downloadGeminiVideo(
    videoUri: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const hostname = new URL(videoUri).hostname;
    const headers =
      hostname === "generativelanguage.googleapis.com"
        ? { "x-goog-api-key": this.apiKey }
        : undefined;
    const response = await safeFetch(
      videoUri,
      { headers, signal },
      5,
      this._fetch
    );
    if (!response.ok) {
      throw new Error(`Video download failed: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Text-to-video (Veo models — async operation with polling)
  // ---------------------------------------------------------------------------

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("veo-")) {
      throw new Error(
        `Model ${modelId} is not a Veo model. Only Veo models support text-to-video.`
      );
    }

    const body: Record<string, unknown> = {
      instances: [{ prompt: params.prompt }]
    };
    const parameters = this.buildVideoParameters(params);
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    const signal =
      params.timeoutSeconds && params.timeoutSeconds > 0
        ? AbortSignal.timeout(params.timeoutSeconds * 1000)
        : undefined;
    const response = await this._fetch(
      `${GEMINI_API_BASE}/models/${modelId}:predictLongRunning`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(body),
        signal
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini video generation failed ${response.status}: ${errText}`
      );
    }

    const operation = await this.waitForVideoOperation(
      (await response.json()) as GeminiVideoOperation,
      params.timeoutSeconds,
      signal
    );
    const videoUri = this.getVideoUri(operation);
    if (!videoUri) {
      const refusal = this.videoContentFilterRefusal(operation, modelId);
      if (refusal) throw refusal;
      throw new Error("No video URI in response");
    }
    return this.downloadGeminiVideo(videoUri, signal);
  }

  // ---------------------------------------------------------------------------
  // Image-to-video (Veo models)
  // ---------------------------------------------------------------------------

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const image = images[0];
    if (!image || image.length === 0) {
      throw new Error("Input image cannot be empty.");
    }

    const modelId = params.model.id;
    if (!modelId.startsWith("veo-")) {
      throw new Error(
        `Model ${modelId} is not a Veo model. Only Veo models support image-to-video.`
      );
    }

    const prompt = params.prompt ?? "Animate this image";
    const body: Record<string, unknown> = {
      instances: [
        {
          prompt,
          image: {
            bytesBase64Encoded: Buffer.from(image).toString("base64"),
            mimeType: "image/png"
          }
        }
      ]
    };
    const parameters = this.buildVideoParameters(params);
    if (Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    const signal =
      params.timeoutSeconds && params.timeoutSeconds > 0
        ? AbortSignal.timeout(params.timeoutSeconds * 1000)
        : undefined;
    const response = await this._fetch(
      `${GEMINI_API_BASE}/models/${modelId}:predictLongRunning`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(body),
        signal
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini image-to-video failed ${response.status}: ${errText}`
      );
    }

    const operation = await this.waitForVideoOperation(
      (await response.json()) as GeminiVideoOperation,
      params.timeoutSeconds,
      signal
    );
    const videoUri = this.getVideoUri(operation);
    if (!videoUri) {
      const refusal = this.videoContentFilterRefusal(operation, modelId);
      if (refusal) throw refusal;
      throw new Error("No video URI in response");
    }
    return this.downloadGeminiVideo(videoUri, signal);
  }

  // ---------------------------------------------------------------------------
  // Error detection
  // ---------------------------------------------------------------------------

  override isContextExceededError(error: unknown): boolean {
    return geminiContextExceeded(error) !== null;
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("maximum context") ||
      msg.includes("too long") ||
      msg.includes("token limit")
    );
  }
}
