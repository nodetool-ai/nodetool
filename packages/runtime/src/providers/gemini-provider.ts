import type { Chunk } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import { sniffAudioMime } from "./audio-mime.js";
import { safeFetch } from "./safe-url.js";

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
}

/** A Gemini content part. */
interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
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
    functionCallingConfig: { mode: "ANY"; allowedFunctionNames?: string[] };
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

interface GeminiVideoOperation {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
}

// Gemini's function-declaration schema is a strict subset of OpenAPI 3.0.
// It rejects JSON-Schema-only fields like `additionalProperties`, `$schema`,
// `$id`, `$ref`, `definitions`, `patternProperties`, etc. Any one of these
// anywhere in the tree causes a 400 that aborts the entire tool batch, so we
// recursively strip them before sending.
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "$schema",
  "$id",
  "$ref",
  "definitions",
  "patternProperties",
  "propertyNames",
  "unevaluatedProperties",
  "dependentSchemas",
  "dependentRequired",
  "exclusiveMinimum",
  "exclusiveMaximum"
]);

function isArraySchemaType(type: unknown): boolean {
  if (typeof type === "string") return type.toLowerCase() === "array";
  if (Array.isArray(type)) {
    return type.some(
      (t) => typeof t === "string" && t.toLowerCase() === "array"
    );
  }
  return false;
}

function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiSchema);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(k)) continue;
      out[k] = sanitizeGeminiSchema(v);
    }
    // Gemini rejects an array schema that omits `items` ("items: missing
    // field"). JSON Schema allows it, so backfill a permissive default.
    if (isArraySchemaType(out.type) && out.items === undefined) {
      out.items = { type: "string" };
    }
    return out;
  }
  return value;
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Gemini returned an invalid SSE event");
        }
        yield parseGeminiResponse(parsed);
      }
      if (done) break;
    }
  } finally {
    if (signal?.aborted)
      await reader.cancel(signal.reason).catch(() => undefined);
    reader.releaseLock();
  }
}

export class GeminiProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["GEMINI_API_KEY"];
  }

  readonly apiKey: string;
  private _fetch: typeof fetch;

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
  }

  getContainerEnv(): Record<string, string> {
    return { GEMINI_API_KEY: this.apiKey };
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  override get supportsNativeWebSearch(): boolean {
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
        const payload = (await response.json()) as GeminiModelsPage;
        if (!Array.isArray(payload.models)) return [];
        items.push(...payload.models);
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

      if (
        (typeof img.data === "string" && img.data.length > 0) ||
        (img.data instanceof Uint8Array && img.data.length > 0)
      ) {
        if (typeof img.data === "string") {
          base64Data = img.data;
        } else {
          base64Data = Buffer.from(img.data).toString("base64");
        }
      } else if (img.uri) {
        if (img.uri.startsWith("data:")) {
          const idx = img.uri.indexOf(",");
          if (idx < 0) throw new Error("Invalid image data URI");
          const header = img.uri.slice(5, idx);
          mimeType = header.split(";")[0] || mimeType;
          base64Data = img.uri.slice(idx + 1);
        } else {
          const resp = await safeFetch(img.uri, undefined, 5, this._fetch);
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

      if (
        (typeof aud.data === "string" && aud.data.length > 0) ||
        (aud.data instanceof Uint8Array && aud.data.length > 0)
      ) {
        if (typeof aud.data === "string") {
          base64Data = aud.data;
          mimeType =
            mimeType ?? sniffAudioMime(Buffer.from(aud.data, "base64"));
        } else {
          const bytes = Buffer.from(aud.data);
          base64Data = bytes.toString("base64");
          mimeType = mimeType ?? sniffAudioMime(bytes);
        }
      } else if (aud.uri) {
        if (aud.uri.startsWith("data:")) {
          const idx = aud.uri.indexOf(",");
          if (idx < 0) throw new Error("Invalid audio data URI");
          const header = aud.uri.slice(5, idx);
          mimeType = mimeType ?? header.split(";")[0];
          base64Data = aud.uri.slice(idx + 1);
        } else {
          const resp = await safeFetch(aud.uri, undefined, 5, this._fetch);
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

    return { text: "[unsupported content type]" };
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
          typeof msg.content === "string"
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
          typeof msg.content === "string"
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
          appendGeminiContent(contents, {
            role: "model",
            parts: msg._rawGeminiParts as GeminiPart[]
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

        if (typeof msg.content === "string" && msg.content) {
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
      if (typeof msg.content === "string") {
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

    return { contents, systemInstruction };
  }

  formatTools(tools: ProviderTool[]): {
    geminiTools: Array<{
      functionDeclarations: Array<Record<string, unknown>>;
    }>;
    nameMap: Map<string, string>;
    reverseMap: Map<string, string>;
  } {
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
    const { model, tools = [], maxTokens = 16384, temperature, topP } = args;

    const { geminiTools, nameMap, reverseMap } = this.formatTools(tools);
    const { contents, systemInstruction } = await this.convertMessages(
      args.messages,
      nameMap
    );

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (geminiTools.length > 0) {
      body.tools = geminiTools;
    }
    if (tools.some((tool) => tool.name === WEB_SEARCH_TOOL_NAME)) {
      body.tools = [...(body.tools ?? []), { googleSearch: {} }];
    }
    if (tools.some((tool) => tool.type === "code_interpreter")) {
      body.tools = [...(body.tools ?? []), { codeExecution: {} }];
    }
    if (
      args.toolChoice &&
      (args.toolChoice === "any"
        ? geminiTools.length > 0
        : nameMap.has(args.toolChoice))
    ) {
      const selected =
        args.toolChoice === "any"
          ? undefined
          : (nameMap.get(args.toolChoice) ?? sanitizeToolName(args.toolChoice));
      body.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          ...(selected ? { allowedFunctionNames: [selected] } : {})
        }
      };
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
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

    const data = parseGeminiResponse(await response.json());

    const dataError = geminiResponseError(data);
    if (dataError) throw dataError;

    this.trackGeminiUsage(model, data.usageMetadata);

    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("Gemini returned no candidates");
    }

    return this.extractMessage(candidate.content.parts, reverseMap);
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
    const { model, tools = [], maxTokens = 16384, temperature, topP } = args;

    const { geminiTools, nameMap, reverseMap } = this.formatTools(tools);
    const { contents, systemInstruction } = await this.convertMessages(
      args.messages,
      nameMap
    );

    const body: GeminiRequest = { contents };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (geminiTools.length > 0) {
      body.tools = geminiTools;
    }
    if (tools.some((tool) => tool.name === WEB_SEARCH_TOOL_NAME)) {
      body.tools = [...(body.tools ?? []), { googleSearch: {} }];
    }
    if (tools.some((tool) => tool.type === "code_interpreter")) {
      body.tools = [...(body.tools ?? []), { codeExecution: {} }];
    }
    if (
      args.toolChoice &&
      (args.toolChoice === "any"
        ? geminiTools.length > 0
        : nameMap.has(args.toolChoice))
    ) {
      const selected =
        args.toolChoice === "any"
          ? undefined
          : (nameMap.get(args.toolChoice) ?? sanitizeToolName(args.toolChoice));
      body.toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          ...(selected ? { allowedFunctionNames: [selected] } : {})
        }
      };
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: maxTokens
    };
    if (temperature != null) generationConfig.temperature = temperature;
    if (topP != null) generationConfig.topP = topP;
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

    const texts = typeof text === "string" ? [text] : text;

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
      const body = {
        contents: [{ role: "user" as const, parts: [{ text: params.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {})
        }
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
    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: params.prompt }, ...imageParts]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {})
      }
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
  ): Record<string, unknown> {
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
      throw new Error("No video URI in response");
    }
    return this.downloadGeminiVideo(videoUri, signal);
  }

  // ---------------------------------------------------------------------------
  // Error detection
  // ---------------------------------------------------------------------------

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
