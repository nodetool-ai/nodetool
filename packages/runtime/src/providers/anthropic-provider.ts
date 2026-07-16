import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type {
  Message as AnthropicMessage,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  TextCitation
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import { safeFetch } from "./safe-url.js";

const log = createLogger("nodetool.runtime.providers.anthropic");
import type {
  LanguageModel,
  AnthropicThinkingBlock,
  Message,
  MessageCitation,
  MessageContent,
  MessageDocumentContent,
  MessageImageContent,
  MessageTextContent,
  ProviderEffort,
  ProviderId,
  ProviderStreamItem,
  ProviderThinkingConfig,
  ProviderTool,
  ToolCall
} from "./types.js";
import { WEB_SEARCH_TOOL_NAME } from "./types.js";

interface AnthropicProviderOptions {
  client?: Anthropic;
  clientFactory?: (apiKey: string) => Anthropic;
  fetchFn?: typeof fetch;
  clientOptions?: Pick<
    ClientOptions,
    "authToken" | "credentials" | "config" | "profile" | "baseURL"
  >;
  cacheControl?: { type: "ephemeral"; ttl?: "5m" | "1h" };
  betas?: string[];
  /**
   * Provider id reported by this instance. Defaults to `"anthropic"`.
   * Anthropic-compatible subclasses (gateways pointed at a different base URL)
   * pass their own id so the readonly `provider` field is set via the base
   * constructor rather than reassigned afterwards.
   */
  providerId?: ProviderId;
}

type AnthropicRawBlock = Record<string, unknown>;
type AnthropicToolCall = ToolCall & {
  _anthropicContentBlocks?: AnthropicRawBlock[];
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PAUSE_TURN_CONTINUATIONS = 5;

function toRawBlock(block: object): AnthropicRawBlock {
  return Object.fromEntries(Object.entries(block));
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), 60_000);
}

function apiErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

function apiErrorRetryAfter(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "headers" in error &&
    error.headers instanceof Headers
  ) {
    return error.headers.get("retry-after");
  }
  return null;
}

function mapCitation(citation: TextCitation): MessageCitation {
  switch (citation.type) {
    case "char_location":
      return {
        type: citation.type,
        citedText: citation.cited_text,
        documentIndex: citation.document_index,
        documentTitle: citation.document_title,
        fileId: citation.file_id,
        startCharIndex: citation.start_char_index,
        endCharIndex: citation.end_char_index
      };
    case "page_location":
      return {
        type: citation.type,
        citedText: citation.cited_text,
        documentIndex: citation.document_index,
        documentTitle: citation.document_title,
        fileId: citation.file_id,
        startPageNumber: citation.start_page_number,
        endPageNumber: citation.end_page_number
      };
    case "content_block_location":
      return {
        type: citation.type,
        citedText: citation.cited_text,
        documentIndex: citation.document_index,
        documentTitle: citation.document_title,
        fileId: citation.file_id,
        startBlockIndex: citation.start_block_index,
        endBlockIndex: citation.end_block_index
      };
    case "web_search_result_location":
      return {
        type: citation.type,
        citedText: citation.cited_text,
        encryptedIndex: citation.encrypted_index,
        url: citation.url,
        title: citation.title
      };
    case "search_result_location":
      return {
        type: citation.type,
        citedText: citation.cited_text,
        searchResultIndex: citation.search_result_index,
        source: citation.source,
        title: citation.title,
        startBlockIndex: citation.start_block_index,
        endBlockIndex: citation.end_block_index
      };
  }
}

function textContentFromRawBlocks(
  blocks: AnthropicRawBlock[]
): MessageTextContent[] {
  return blocks.flatMap((block) => {
    if (block?.type !== "text" || typeof block.text !== "string") return [];
    const citations = Array.isArray(block.citations)
      ? (block.citations as TextCitation[]).map(mapCitation)
      : undefined;
    return [
      {
        type: "text" as const,
        text: block.text,
        ...(citations && citations.length > 0 ? { citations } : {})
      }
    ];
  });
}

function toAnthropicCitation(citation: MessageCitation): AnthropicRawBlock {
  switch (citation.type) {
    case "char_location":
      return {
        type: citation.type,
        cited_text: citation.citedText,
        document_index: citation.documentIndex,
        document_title: citation.documentTitle ?? null,
        start_char_index: citation.startCharIndex,
        end_char_index: citation.endCharIndex
      };
    case "page_location":
      return {
        type: citation.type,
        cited_text: citation.citedText,
        document_index: citation.documentIndex,
        document_title: citation.documentTitle ?? null,
        start_page_number: citation.startPageNumber,
        end_page_number: citation.endPageNumber
      };
    case "content_block_location":
      return {
        type: citation.type,
        cited_text: citation.citedText,
        document_index: citation.documentIndex,
        document_title: citation.documentTitle ?? null,
        start_block_index: citation.startBlockIndex,
        end_block_index: citation.endBlockIndex
      };
    case "web_search_result_location":
      return {
        type: citation.type,
        cited_text: citation.citedText,
        encrypted_index: citation.encryptedIndex,
        title: citation.title ?? null
      };
    case "search_result_location":
      return {
        type: citation.type,
        cited_text: citation.citedText,
        search_result_index: citation.searchResultIndex,
        source: citation.source,
        title: citation.title ?? null,
        start_block_index: citation.startBlockIndex,
        end_block_index: citation.endBlockIndex
      };
  }
}

function toAnthropicTextBlock(part: MessageTextContent): AnthropicRawBlock {
  return {
    type: "text",
    text: part.text,
    ...(part.citations
      ? { citations: part.citations.map(toAnthropicCitation) }
      : {})
  };
}

type ThinkingPolicy =
  | "manual"
  | "adaptive_optional"
  | "adaptive_default"
  | "adaptive_required";

function thinkingPolicy(model: string): ThinkingPolicy {
  const id = model.toLowerCase();
  if (
    id.includes("claude-fable-5") ||
    id.includes("claude-mythos-5") ||
    id.includes("claude-mythos-preview")
  ) {
    return "adaptive_required";
  }
  if (id.includes("claude-sonnet-5")) return "adaptive_default";
  if (id.includes("claude-opus-4-7") || id.includes("claude-opus-4-8")) {
    return "adaptive_optional";
  }
  return "manual";
}

function rejectsCustomSampling(model: string): boolean {
  return thinkingPolicy(model) !== "manual";
}


function isTextContent(content: MessageContent): content is MessageTextContent {
  return content.type === "text";
}

function isImageContent(
  content: MessageContent
): content is MessageImageContent {
  return content.type === "image_url";
}

function isDocumentContent(
  content: MessageContent
): content is MessageDocumentContent {
  return content.type === "document";
}

function bytesToBase64(data: Uint8Array | string | undefined): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  return Buffer.from(data).toString("base64");
}

function assertImageSize(base64: string): void {
  if (Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES) {
    throw new Error("Anthropic image exceeds the 5 MB limit");
  }
}

/**
 * Anthropic's image block accepts only image/jpeg, image/png, image/gif and
 * image/webp as `media_type`. Strip any Content-Type parameters, normalize the
 * common `image/jpg` alias, and reject unsupported media types.
 */
function normalizeAnthropicImageMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "image/jpg") return "image/jpeg";
  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supported.includes(base)) {
    throw new Error(`Anthropic does not support image media type ${base}`);
  }
  return base;
}

function parseDataUri(uri: string): { mime: string; base64: string } {
  const idx = uri.indexOf(",");
  if (idx < 0) {
    throw new Error("Invalid data URI");
  }

  const header = uri.slice(5, idx);
  const payload = uri.slice(idx + 1);
  const isBase64 = header.includes(";base64");
  const mime = header.split(";")[0] || "application/octet-stream";

  if (isBase64) {
    return { mime, base64: payload };
  }

  return {
    mime,
    base64: Buffer.from(decodeURIComponent(payload), "utf8").toString("base64")
  };
}

export class AnthropicProvider extends BaseProvider {
  /**
   * Anthropic runs web search server-side via the `web_search_20250305` server
   * tool. Gate on the provider id so subclasses that reuse the Anthropic SDK
   * against a different endpoint (e.g. Moonshot/Kimi, which does not implement
   * that server tool) fall back to the SerpAPI WebSearchTool instead of sending
   * an unsupported tool that silently breaks web search.
   */
  override get supportsNativeWebSearch(): boolean {
    return this.provider === "anthropic";
  }

  static requiredSecrets(): string[] {
    return ["ANTHROPIC_API_KEY"];
  }

  readonly apiKey: string;
  readonly authToken: string;
  private _client: Anthropic | null;
  private _clientFactory: (apiKey: string) => Anthropic;
  private _fetch: typeof fetch;
  private _clientOptions: AnthropicProviderOptions["clientOptions"];
  private _cacheControl: AnthropicProviderOptions["cacheControl"];
  private _betas: string[];

  constructor(
    secrets: { ANTHROPIC_API_KEY?: string; ANTHROPIC_AUTH_TOKEN?: string },
    options: AnthropicProviderOptions = {}
  ) {
    super(options.providerId ?? "anthropic");

    const apiKey = secrets.ANTHROPIC_API_KEY?.trim() ?? "";
    const authToken =
      secrets.ANTHROPIC_AUTH_TOKEN?.trim() ??
      options.clientOptions?.authToken?.trim() ??
      "";
    const hasStructuredAuth = Boolean(
      options.clientOptions?.credentials ||
        options.clientOptions?.config ||
        options.clientOptions?.profile
    );
    if (!apiKey && !authToken && !hasStructuredAuth) {
      throw new Error(
        "Anthropic authentication is not configured (API key, auth token, credentials, config, or profile required)"
      );
    }

    this.apiKey = apiKey;
    this.authToken = authToken;
    this._client = options.client ?? null;
    this._clientOptions = options.clientOptions;
    this._cacheControl = options.cacheControl;
    this._betas = options.betas ?? [];
    this._clientFactory =
      options.clientFactory ??
      ((key) => {
        const clientOptions: ClientOptions = {
          ...this._clientOptions,
          ...(key ? { apiKey: key } : {}),
          ...(this.authToken ? { authToken: this.authToken } : {})
        };
        return new Anthropic(clientOptions);
      });
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv(): Record<string, string> {
    if (this.apiKey) return { ANTHROPIC_API_KEY: this.apiKey };
    if (this.authToken) return { ANTHROPIC_AUTH_TOKEN: this.authToken };
    return {};
  }

  getClient(): Anthropic {
    if (!this._client) {
      this._client = this._clientFactory(this.apiKey);
    }
    return this._client;
  }

  private requestOptions(signal?: AbortSignal): {
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } {
    return {
      ...(signal ? { signal } : {}),
      ...(this._betas.length > 0
        ? { headers: { "anthropic-beta": this._betas.join(",") } }
        : {})
    };
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const models: LanguageModel[] = [];
        let afterId: string | undefined;
        do {
          const page = await this.getClient().models.list(
            { limit: 1000, ...(afterId ? { after_id: afterId } : {}) },
            {
              ...this.requestOptions(),
              timeout: 10_000,
              maxRetries: 0
            }
          );
          models.push(
            ...page.data.map((model) => ({
              id: model.id,
              name: model.display_name,
              provider: "anthropic" as const
            }))
          );
          if (page.has_more && !page.last_id) {
            throw new Error(
              "Anthropic Models API returned has_more without last_id"
            );
          }
          afterId = page.has_more ? page.last_id ?? undefined : undefined;
        } while (afterId);
        return models;
      } catch (error) {
        const status = apiErrorStatus(error);
        if (status === 401 || status === 403) return [];
        if (
          attempt === maxRetries - 1 ||
          (status !== undefined &&
            ![429, 500, 502, 503, 504, 529].includes(status))
        ) {
          log.warn("Failed to fetch Anthropic models", {
            error: error instanceof Error ? error.message : String(error),
            status
          });
          return [];
        }
        const delay =
          retryAfterMs(apiErrorRetryAfter(error)) ?? 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  private prepareJsonSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return schema;
    }

    const obj = { ...(schema as Record<string, unknown>) };

    if (obj.type === "object" && obj.additionalProperties === undefined) {
      obj.additionalProperties = false;
    }

    if (
      obj.properties &&
      typeof obj.properties === "object" &&
      !Array.isArray(obj.properties)
    ) {
      obj.properties = Object.fromEntries(
        Object.entries(obj.properties as Record<string, unknown>).map(
          ([k, v]) => [k, this.prepareJsonSchema(v)]
        )
      );
    }

    if (obj.items && typeof obj.items === "object") {
      obj.items = this.prepareJsonSchema(obj.items);
    }

    for (const defsKey of ["definitions", "$defs"]) {
      const defs = obj[defsKey];
      if (defs && typeof defs === "object" && !Array.isArray(defs)) {
        obj[defsKey] = Object.fromEntries(
          Object.entries(defs as Record<string, unknown>).map(([k, v]) => [
            k,
            this.prepareJsonSchema(v)
          ])
        );
      }
    }

    return obj;
  }

  /**
   * Convert a {@link MessageImageContent} part into an Anthropic image block
   * (`{ type: "image", source: { type: "base64", ... } }`), resolving data
   * URIs, raw base64, and remote/storage URIs (which are fetched and encoded).
   */
  private async convertImagePart(
    part: MessageImageContent,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const rawData = bytesToBase64(part.image.data);
    const uri = part.image.uri ?? "";

    let mediaType = part.image.mimeType ?? "image/png";
    let base64: string;

    if (rawData) {
      if (rawData.startsWith("data:")) {
        const parsed = parseDataUri(rawData);
        if (
          part.image.mimeType &&
          normalizeAnthropicImageMime(part.image.mimeType) !==
            normalizeAnthropicImageMime(parsed.mime)
        ) {
          throw new Error("Anthropic image data URI MIME mismatch");
        }
        base64 = parsed.base64;
        mediaType = part.image.mimeType ?? parsed.mime;
      } else {
        base64 = rawData;
      }
    } else if (uri.startsWith("data:")) {
      const parsed = parseDataUri(uri);
      if (
        part.image.mimeType &&
        normalizeAnthropicImageMime(part.image.mimeType) !==
          normalizeAnthropicImageMime(parsed.mime)
      ) {
        throw new Error("Anthropic image data URI MIME mismatch");
      }
      base64 = parsed.base64;
      mediaType = part.image.mimeType ?? parsed.mime;
    } else if (uri) {
      const resolved = await this.resolveUri(uri);
      if (resolved.startsWith("data:")) {
        const parsed = parseDataUri(resolved);
        if (
          part.image.mimeType &&
          normalizeAnthropicImageMime(part.image.mimeType) !==
            normalizeAnthropicImageMime(parsed.mime)
        ) {
          throw new Error("Anthropic image data URI MIME mismatch");
        }
        base64 = parsed.base64;
        mediaType = part.image.mimeType ?? parsed.mime;
      } else {
        const response = await safeFetch(
          resolved,
          signal ? { signal } : undefined,
          5,
          this._fetch
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch URI: ${response.status}`);
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_IMAGE_BYTES
        ) {
          throw new Error("Anthropic image exceeds the 5 MB limit");
        }
        mediaType =
          part.image.mimeType ??
          response.headers.get("content-type") ??
          "image/png";
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          throw new Error("Anthropic image exceeds the 5 MB limit");
        }
        base64 = Buffer.from(bytes).toString("base64");
      }
    } else {
      throw new Error("Invalid image reference with no uri or data");
    }
    assertImageSize(base64);

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: normalizeAnthropicImageMime(mediaType),
        data: base64
      }
    };
  }

  private async convertDocumentPart(
    part: MessageDocumentContent
  ): Promise<Record<string, unknown>> {
    const { data, uri, mimeType, title } = part.document;
    let source: Record<string, unknown>;

    if (data !== undefined) {
      const parsed =
        typeof data === "string" && data.startsWith("data:")
          ? parseDataUri(data)
          : undefined;
      const effectiveMime = mimeType ?? parsed?.mime ?? "application/pdf";
      if (parsed && mimeType && parsed.mime !== mimeType) {
        throw new Error(
          `Anthropic document MIME mismatch: ${mimeType} vs ${parsed.mime}`
        );
      }
      if (effectiveMime === "text/plain") {
        const text =
          parsed
            ? Buffer.from(parsed.base64, "base64").toString("utf8")
            : typeof data === "string"
            ? data
            : Buffer.from(data).toString("utf8");
        source = { type: "text", media_type: "text/plain", data: text };
      } else if (effectiveMime === "application/pdf") {
        const encoded = parsed?.base64 ?? bytesToBase64(data);
        source = {
          type: "base64",
          media_type: "application/pdf",
          data: encoded
        };
      } else {
        throw new Error(
          `Anthropic does not support document media type ${effectiveMime}`
        );
      }
    } else if (uri) {
      const resolved = await this.resolveUri(uri);
      if (/^https:\/\//i.test(resolved)) {
        source = { type: "url", url: resolved };
      } else if (!resolved.startsWith("data:")) {
        throw new Error(
          "Anthropic document URI must resolve to PDF data or an HTTPS URL"
        );
      } else {
        const parsed = parseDataUri(resolved);
        if (parsed.mime !== "application/pdf") {
          throw new Error(
            `Anthropic does not support document media type ${parsed.mime}`
          );
        }
        source = {
          type: "base64",
          media_type: "application/pdf",
          data: parsed.base64
        };
      }
    } else {
      throw new Error(
        "Anthropic document content requires PDF/text data or an HTTPS PDF URL"
      );
    }

    return {
      type: "document",
      source,
      ...(title ? { title } : {}),
      ...(part.context ? { context: part.context } : {}),
      ...(part.citations !== undefined
        ? { citations: { enabled: part.citations } }
        : {})
    };
  }

  async convertMessage(
    message: Message,
    signal?: AbortSignal
  ): Promise<Record<string, unknown> | null> {
    if (message.role === "tool") {
      if (!message.toolCallId) {
        throw new Error("Tool call ID must not be None");
      }

      // Anthropic tool_result content may be a string or an array of blocks
      // (text + image). Structured content (e.g. ui_3d_capture_view's
      // screenshot) is converted to blocks so vision models can see it; plain
      // results stay stringified as before.
      let resultContent: unknown;
      if (typeof message.content === "string") {
        resultContent = message.content;
      } else if (Array.isArray(message.content)) {
        const blocks: Array<Record<string, unknown>> = [];
        for (const part of message.content) {
          if (isTextContent(part)) {
            blocks.push(toAnthropicTextBlock(part));
          } else if (isImageContent(part)) {
            blocks.push(await this.convertImagePart(part, signal));
          }
        }
        resultContent =
          blocks.length > 0 ? blocks : JSON.stringify(message.content);
      } else {
        resultContent = JSON.stringify(message.content ?? null);
      }

      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: resultContent,
            ...(message.isError ? { is_error: true } : {})
          }
        ]
      };
    }

    if (message.role === "system") {
      // Anthropic has no `system` role in the messages array (the system prompt
      // is a top-level param). The main generate paths strip system messages
      // before conversion; if one still reaches here, fold it into a user
      // message rather than mislabeling it as assistant text (and avoid
      // String(array) producing "[object Object]").
      const text =
        typeof message.content === "string"
          ? message.content
          : (message.content ?? [])
              .filter(isTextContent)
              .map((c) => c.text)
              .join("\n");
      return { role: "user", content: text };
    }

    if (message.role === "user") {
      if (typeof message.content === "string") {
        return { role: "user", content: message.content };
      }

      const parts = message.content ?? [];
      const content: Array<Record<string, unknown>> = [];

      for (const part of parts) {
        if (isTextContent(part)) {
          content.push(toAnthropicTextBlock(part));
          continue;
        }
        if (isImageContent(part)) {
          content.push(await this.convertImagePart(part, signal));
          continue;
        }
        if (isDocumentContent(part)) {
          content.push(await this.convertDocumentPart(part));
          continue;
        }
        throw new Error(
          `Anthropic does not support ${part.type} message content`
        );
      }

      return {
        role: "user",
        content
      };
    }

    if (message.role !== "assistant") {
      throw new Error(`Unknown message role ${message.role}`);
    }

    if (
      !message.content &&
      (!message.toolCalls || message.toolCalls.length === 0)
    ) {
      return null;
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      const rawBlocks = (message.toolCalls as AnthropicToolCall[]).find(
        (toolCall) => toolCall._anthropicContentBlocks
      )?._anthropicContentBlocks;
      if (rawBlocks) {
        return { role: "assistant", content: rawBlocks };
      }
      const contentBlocks: Array<Record<string, unknown>> = [
        ...(message._anthropicThinkingBlocks ?? [])
      ];
      if (typeof message.content === "string" && message.content.trim()) {
        contentBlocks.push({ type: "text", text: message.content });
      }

      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (isTextContent(part) && part.text.trim()) {
            contentBlocks.push(toAnthropicTextBlock(part));
          }
        }
      }

      for (const tc of message.toolCalls) {
        contentBlocks.push({
          type: "tool_use",
          name: tc.name,
          id: tc.id,
          input: tc.args
        });
      }

      return {
        role: "assistant",
        content: contentBlocks
      };
    }

    if (typeof message.content === "string") {
      return { role: "assistant", content: message.content };
    }

    if (Array.isArray(message.content)) {
      return {
        role: "assistant",
        content: message.content
          .filter((part) => isTextContent(part))
          .map(toAnthropicTextBlock)
      };
    }

    throw new Error(`Unknown message content type ${typeof message.content}`);
  }

  formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    return tools.map((tool) => {
      // The canonical web-search tool is rendered as Anthropic's built-in
      // server tool — the search runs server-side and its result blocks stream
      // back within the same turn (our stream parser ignores them), so the
      // model answers from live web data without a client round-trip.
      if (tool.name === WEB_SEARCH_TOOL_NAME) {
        return {
          type: "web_search_20250305",
          name: WEB_SEARCH_TOOL_NAME,
          max_uses: 5,
          ...(tool.cacheControl ? { cache_control: tool.cacheControl } : {}),
          ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
          ...(tool.deferLoading !== undefined
            ? { defer_loading: tool.deferLoading }
            : {}),
          ...(tool.allowedCallers
            ? { allowed_callers: tool.allowedCallers }
            : {})
        };
      }
      return {
        name: tool.name,
        description: tool.description ?? "",
        input_schema: this.prepareJsonSchema(
          tool.inputSchema ?? { type: "object", properties: {} }
        ),
        ...(tool.inputExamples ? { input_examples: tool.inputExamples } : {}),
        ...(tool.cacheControl ? { cache_control: tool.cacheControl } : {}),
        ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
        ...(tool.deferLoading !== undefined
          ? { defer_loading: tool.deferLoading }
          : {}),
        ...(tool.allowedCallers
          ? { allowed_callers: tool.allowedCallers }
          : {})
      };
    });
  }


  private extractSystemMessage(messages: Message[]): string {
    const systemMessages = messages.filter((m) => m.role === "system");
    if (systemMessages.length === 0) {
      return "You are a helpful assistant.";
    }
    const sections = systemMessages
      .map((message) => {
        if (typeof message.content === "string") return message.content;
        if (Array.isArray(message.content)) {
          return message.content
            .filter(isTextContent)
            .map((part) => part.text)
            .join(" ");
        }
        return message.content == null ? "" : String(message.content);
      })
      .filter(Boolean);
    return sections.join("\n\n") || "You are a helpful assistant.";
  }

  private buildRequest(args: {
    model: string;
    messages: AnthropicRawBlock[];
    system: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    thinking?: ProviderThinkingConfig;
    effort?: ProviderEffort;
    thinkingBudget?: number;
  }): Record<string, unknown> {
    const formattedTools =
      args.tools && args.tools.length > 0
        ? this.formatTools(args.tools)
        : undefined;
    const policy = thinkingPolicy(args.model);
    const legacyThinking: ProviderThinkingConfig | undefined =
      args.thinkingBudget === undefined
        ? undefined
        : policy !== "manual"
          ? { type: "adaptive" }
          : {
              type: "manual",
              budgetTokens: args.thinkingBudget
            };
    const thinking = args.thinking ?? legacyThinking;
    if (thinking?.type === "manual" && policy !== "manual") {
      throw new Error(
        `${args.model} requires adaptive thinking; manual budgets are unsupported`
      );
    }
    if (thinking?.type === "manual" && thinking.budgetTokens < 1024) {
      throw new Error("Anthropic thinking budget must be at least 1024 tokens");
    }
    if (thinking?.type === "disabled" && policy === "adaptive_required") {
      throw new Error(`${args.model} does not allow thinking to be disabled`);
    }
    const thinkingEnabled =
      thinking?.type === "adaptive" ||
      thinking?.type === "manual" ||
      (!thinking &&
        (policy === "adaptive_default" || policy === "adaptive_required"));
    if (args.toolChoice && thinkingEnabled) {
      throw new Error(
        "Anthropic does not allow a forced tool choice while thinking is active"
      );
    }
    const toolChoice =
      args.toolChoice
        ? args.toolChoice === "any"
          ? { type: "any" }
          : { type: "tool", name: args.toolChoice }
        : undefined;
    const maxTokens = thinkingEnabled
      ? thinking?.type !== "manual"
        ? args.maxTokens ?? 8192
        : Math.max(args.maxTokens ?? 8192, thinking.budgetTokens + 1)
      : args.maxTokens ?? 8192;
    const sampling = rejectsCustomSampling(args.model)
      ? {}
      : !thinkingEnabled
        ? args.temperature != null
          ? { temperature: args.temperature }
          : args.topP != null
            ? { top_p: args.topP }
            : {}
        : thinking?.type === "manual" &&
            args.topP != null &&
            args.topP >= 0.95
          ? { top_p: args.topP }
          : {};

    const anthropicThinking =
      thinking?.type === "adaptive"
        ? {
            type: "adaptive",
            ...(thinking.display ? { display: thinking.display } : {})
          }
        : thinking?.type === "manual"
          ? {
              type: "enabled",
              budget_tokens: thinking.budgetTokens,
              ...(thinking.display ? { display: thinking.display } : {})
            }
          : thinking?.type === "disabled"
            ? { type: "disabled" }
            : undefined;

    return {
      model: args.model,
      messages: args.messages,
      system: args.system,
      max_tokens: maxTokens,
      ...(formattedTools ? { tools: formattedTools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...sampling,
      ...(anthropicThinking ? { thinking: anthropicThinking } : {}),
      ...(args.effort ? { output_config: { effort: args.effort } } : {}),
      ...(this._cacheControl ? { cache_control: this._cacheControl } : {})
    };
  }

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
    thinking?: ProviderThinkingConfig;
    effort?: ProviderEffort;
    thinkingBudget?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const system = this.extractSystemMessage(args.messages);
    const converted = await Promise.all(
      args.messages
        .filter((m) => m.role !== "system")
        .map((m) => this.convertMessage(m, args.signal))
    );
    const anthropicMessages = converted.filter(
      (m): m is Record<string, unknown> => m !== null
    );

    const request = this.buildRequest({
      model: args.model,
      messages: anthropicMessages,
      system,
      tools: args.tools,
      toolChoice: args.toolChoice,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      topP: args.topP,
      thinking: args.thinking,
      effort: args.effort,
      thinkingBudget: args.thinkingBudget
    });

    log.debug("Anthropic request", { model: args.model });

    let currentRequest = request;
    for (
      let continuation = 0;
      continuation <= MAX_PAUSE_TURN_CONTINUATIONS;
      continuation++
    ) {
      const streamRequest = {
        ...(currentRequest as unknown as MessageCreateParamsStreaming),
        stream: true as const
      };
      this.recordRequestPayload(streamRequest);
      const stream = await this.getClient().messages.create(
        streamRequest,
        this.requestOptions(args.signal)
      );
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let cacheWriteTokens = 0;
      let stopReason: string | null = null;
      const contentBlocks: AnthropicRawBlock[] = [];
      const jsonByIndex = new Map<number, string>();
      const thinkingBlocks: AnthropicThinkingBlock[] = [];
      const toolCalls: AnthropicToolCall[] = [];

      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens ?? inputTokens;
          cachedTokens =
            event.message.usage.cache_read_input_tokens ?? cachedTokens;
          cacheWriteTokens =
            event.message.usage.cache_creation_input_tokens ?? cacheWriteTokens;
          continue;
        }
        if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
          inputTokens = event.usage.input_tokens ?? inputTokens;
          cachedTokens = event.usage.cache_read_input_tokens ?? cachedTokens;
          cacheWriteTokens =
            event.usage.cache_creation_input_tokens ?? cacheWriteTokens;
          stopReason = event.delta?.stop_reason ?? stopReason;
          continue;
        }
        if (event.type === "content_block_start") {
          const raw = toRawBlock(event.content_block);
          contentBlocks[event.index] = raw;
          if (
            event.content_block.type === "tool_use" ||
            event.content_block.type === "server_tool_use"
          ) {
            jsonByIndex.set(event.index, "");
          }
          if (event.content_block.type === "thinking") {
            thinkingBlocks.push({
              type: "thinking",
              thinking: event.content_block.thinking,
              signature: event.content_block.signature
            });
          } else if (event.content_block.type === "redacted_thinking") {
            thinkingBlocks.push({
              type: "redacted_thinking",
              data: event.content_block.data
            });
          }
          continue;
        }
        if (event.type === "content_block_delta") {
          const index = Number(event.index ?? 0);
          const raw = contentBlocks[index] ?? {};
          contentBlocks[index] = raw;
          const delta = event.delta;
          if ("thinking" in delta && typeof delta.thinking === "string") {
            const thinkingDelta = delta.thinking;
            raw.thinking = String(raw.thinking ?? "") + thinkingDelta;
            const thinking = thinkingBlocks.at(-1);
            if (thinking?.type === "thinking") thinking.thinking += thinkingDelta;
            yield {
              type: "chunk",
              content: thinkingDelta,
              done: false,
              thinking: true
            };
          } else if (
            "signature" in delta &&
            typeof delta.signature === "string"
          ) {
            const signatureDelta = delta.signature;
            raw.signature = String(raw.signature ?? "") + signatureDelta;
            const thinking = thinkingBlocks.at(-1);
            if (thinking?.type === "thinking") thinking.signature += signatureDelta;
          } else if (
            "partial_json" in delta &&
            typeof delta.partial_json === "string"
          ) {
            jsonByIndex.set(
              index,
              (jsonByIndex.get(index) ?? "") + delta.partial_json
            );
          } else if (
            "text" in delta &&
            typeof delta.text === "string"
          ) {
            const textDelta = delta.text;
            raw.text = String(raw.text ?? "") + textDelta;
            yield { type: "chunk", content: textDelta, done: false };
          } else if (delta.type === "citations_delta") {
            const citations = Array.isArray(raw.citations) ? raw.citations : [];
            raw.citations = [...citations, delta.citation];
          }
          continue;
        }
        if (event.type === "content_block_stop") {
          const raw = contentBlocks[event.index];
          const json = jsonByIndex.get(event.index);
          if (json !== undefined) {
            let input: unknown;
            try {
              input = JSON.parse(json || "{}");
            } catch {
              throw new Error("Anthropic returned incomplete tool input JSON");
            }
            raw.input = input;
            jsonByIndex.delete(event.index);
            if (raw.type === "tool_use") {
              if (!input || typeof input !== "object" || Array.isArray(input)) {
                throw new Error("Anthropic returned non-object tool input");
              }
              const toolCall: AnthropicToolCall = {
                id: String(raw.id ?? ""),
                name: String(raw.name ?? ""),
                args: Object.fromEntries(Object.entries(input)),
                _anthropicThinkingBlocks:
                  thinkingBlocks.length > 0 ? [...thinkingBlocks] : undefined
              };
              toolCalls.push(toolCall);
            }
          }
        }
      }

      const hasServerToolContent = contentBlocks.some(
        (block) =>
          block?.type === "server_tool_use" ||
          String(block?.type ?? "").endsWith("_tool_result")
      );
      if (hasServerToolContent) {
        for (const toolCall of toolCalls) {
          toolCall._anthropicContentBlocks = contentBlocks;
        }
      }

      this.trackUsage(args.model, {
        inputTokens: inputTokens + cachedTokens + cacheWriteTokens,
        outputTokens,
        cachedTokens,
        cacheWriteTokens
      });

      if (stopReason === "pause_turn") {
        if (continuation === MAX_PAUSE_TURN_CONTINUATIONS) {
          throw new Error("Anthropic pause_turn continuation limit exceeded");
        }
        currentRequest = {
          ...currentRequest,
          messages: [
            ...((currentRequest.messages as AnthropicRawBlock[]) ?? []),
            { role: "assistant", content: contentBlocks }
          ]
        };
        continue;
      }
      if (
        stopReason === "max_tokens" ||
        stopReason === "model_context_window_exceeded"
      ) {
        throw new Error(`Anthropic response was truncated (${stopReason})`);
      }
      if (stopReason === "refusal") {
        throw new Error("Anthropic refused the request");
      }
      const textContent = textContentFromRawBlocks(contentBlocks);
      if (
        toolCalls.length === 0 &&
        textContent.some((part) => part.citations?.length)
      ) {
        yield {
          type: "message",
          message: { role: "assistant", content: textContent }
        };
      }
      for (const toolCall of toolCalls) yield toolCall;
      yield { type: "chunk", content: "", done: true };
      return;
    }
  }

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
    thinking?: ProviderThinkingConfig;
    effort?: ProviderEffort;
    thinkingBudget?: number;
    signal?: AbortSignal;
  }): Promise<Message> {
    const system = this.extractSystemMessage(args.messages);
    const converted = await Promise.all(
      args.messages
        .filter((m) => m.role !== "system")
        .map((m) => this.convertMessage(m, args.signal))
    );
    const anthropicMessages = converted.filter(
      (m): m is Record<string, unknown> => m !== null
    );

    const request = this.buildRequest({
      model: args.model,
      messages: anthropicMessages,
      system,
      tools: args.tools,
      toolChoice: args.toolChoice,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      topP: args.topP,
      thinking: args.thinking,
      effort: args.effort,
      thinkingBudget: args.thinkingBudget
    });

    log.debug("Anthropic request", { model: args.model });

    let currentRequest = request;
    let response: AnthropicMessage | undefined;
    for (
      let continuation = 0;
      continuation <= MAX_PAUSE_TURN_CONTINUATIONS;
      continuation++
    ) {
      this.recordRequestPayload(currentRequest);
      response = await this.getClient().messages.create(
        currentRequest as unknown as MessageCreateParamsNonStreaming,
        this.requestOptions(args.signal)
      );
      if (response.usage) {
        const cacheRead = response.usage.cache_read_input_tokens ?? 0;
        const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;
        this.trackUsage(args.model, {
          inputTokens: response.usage.input_tokens + cacheRead + cacheWrite,
          outputTokens: response.usage.output_tokens,
          cachedTokens: cacheRead,
          cacheWriteTokens: cacheWrite
        });
      }
      if (response.stop_reason !== "pause_turn") break;
      if (continuation === MAX_PAUSE_TURN_CONTINUATIONS) {
        throw new Error("Anthropic pause_turn continuation limit exceeded");
      }
      currentRequest = {
        ...currentRequest,
        messages: [
          ...((currentRequest.messages as AnthropicRawBlock[]) ?? []),
          {
            role: "assistant",
            content: response.content.map(toRawBlock)
          }
        ]
      };
    }
    if (!response) throw new Error("Anthropic returned no response");
    const stopReason = String(response.stop_reason ?? "");
    if (
      stopReason === "max_tokens" ||
      stopReason === "model_context_window_exceeded"
    ) {
      throw new Error(
        `Anthropic response was truncated (${stopReason})`
      );
    }
    if (stopReason === "refusal") {
      throw new Error("Anthropic refused the request");
    }

    const textParts: MessageTextContent[] = [];
    const toolCalls: AnthropicToolCall[] = [];
    const thinkingBlocks: AnthropicThinkingBlock[] = [];

    const rawContentBlocks = response.content.map(toRawBlock);
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const toolCall: AnthropicToolCall = {
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          args: Object.fromEntries(Object.entries(block.input ?? {}))
        };
        if (
          rawContentBlocks.some(
            (raw) =>
              raw.type === "server_tool_use" ||
              String(raw.type ?? "").endsWith("_tool_result")
          )
        ) {
          toolCall._anthropicContentBlocks = rawContentBlocks;
        }
        toolCalls.push(toolCall);
        continue;
      }
      if (block.type === "thinking") {
        thinkingBlocks.push({
          type: "thinking",
          thinking: block.thinking,
          signature: block.signature
        });
        continue;
      }
      if (block.type === "redacted_thinking") {
        thinkingBlocks.push({ type: "redacted_thinking", data: block.data });
        continue;
      }
      if (block.type === "text") {
        const citations = block.citations?.map(mapCitation);
        textParts.push({
          type: "text",
          text: block.text,
          ...(citations && citations.length > 0 ? { citations } : {})
        });
      }
    }

    const hasCitations = textParts.some((part) => part.citations?.length);

    return {
      role: "assistant",
      content: hasCitations
        ? textParts
        : textParts.map((part) => part.text).join("\n"),
      toolCalls,
      _anthropicThinkingBlocks:
        thinkingBlocks.length > 0 ? thinkingBlocks : undefined
    };
  }

  asHttpStatusError(error: unknown): Error {
    return new Error(String(error));
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("context window") ||
      msg.includes("token limit") ||
      msg.includes("too long") ||
      msg.includes("maximum context")
    );
  }
}
