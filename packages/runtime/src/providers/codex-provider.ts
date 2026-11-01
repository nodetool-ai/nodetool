/**
 * CodexProvider — OpenAI models reached through a ChatGPT/Codex OAuth login
 * instead of an API key.
 *
 * The ChatGPT Codex backend (`chatgpt.com/backend-api/codex`) is NOT the
 * OpenAI API: it speaks the OpenAI **Responses API** (`POST /responses`),
 * behind a WAF that requires the request to look like the Codex CLI
 * (`originator`, `chatgpt-account-id`, a Codex `User-Agent`, an SSE `Accept`).
 * So this provider can't reuse {@link OpenAIProvider}'s chat-completions path —
 * it overrides the chat methods to drive the Responses API directly and parse
 * its SSE event stream.
 *
 * The bearer is the short-lived Codex OAuth access token, resolved (and
 * refreshed) by the host through `getSecret("CODEX_ACCESS_TOKEN")` and passed
 * in as a constructor kwarg — exactly how the registry wires every other
 * credentialed provider.
 */

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { createLogger, type Logger } from "@nodetool-ai/config";
import {
  CODEX_BACKEND_BASE_URL,
  CODEX_DEFAULT_ORIGINATOR,
  CODEX_CLIENT_VERSION,
  PROVIDER_IDS,
  isString,
  type Chunk
} from "@nodetool-ai/protocol";
import { OpenAIProvider } from "./openai-provider.js";
import { extractChatGptAccountId } from "./oauth/jwt-claims.js";
import type {
  ImageModel,
  LanguageModel,
  Message,
  MessageContent,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  ToolCall
} from "./types.js";
import {
  isProviderSessionUpdate,
  isProviderMessageEvent,
  isProviderStop
} from "./types.js";
import type { ProviderCapability } from "./base-provider.js";

const log = createLogger("nodetool.runtime.codex");

/**
 * The models the Codex CLI lists in its picker, mirrored from its bundled
 * `models.json` (entries with `visibility: "list"`). Shown only when the live
 * `/models` listing is unavailable.
 */
export const CODEX_FALLBACK_MODELS: LanguageModel[] = [
  ["gpt-6.1-sol", "GPT-6.1-Sol"],
  ["gpt-6-sol", "GPT-6-Sol"],
  ["gpt-6-luna", "GPT-6-Luna"],
  ["gpt-6-astra", "GPT-6-Astra"],
  ["gpt-5.6-sol", "GPT-5.6-Sol"],
  ["gpt-5.6-terra", "GPT-5.6-Terra"],
  ["gpt-5.6-luna", "GPT-5.6-Luna"],
  ["gpt-5.5", "GPT-5.5"]
].map(([id, name]) => ({ id, name, provider: PROVIDER_IDS.CODEX }));

const CODEX_CONTROL_TOKEN = /<\|(?:endoftext|endofprompt|startoftext)\|>/g;

/** Remove tokenizer control markers that can arrive in untrusted tool output. */
export function sanitizeCodexControlTokens(text: string): string {
  return text.replace(CODEX_CONTROL_TOKEN, " ");
}

function codexClientVersion(): string {
  return (
    (typeof process !== "undefined" && process.env?.CODEX_CLIENT_VERSION) ||
    CODEX_CLIENT_VERSION
  );
}

/**
 * A failed Codex request. The status rides on the error so the provider layer
 * classifies a 401 as an expired sign-in, which its message alone does not
 * reveal: the status sits mid-sentence, where the parser does not look.
 */
function codexHttpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** Parse a Responses SSE stream into its JSON events. */
async function* readSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * The id Codex groups one conversation's requests under. The Codex CLI sends
 * its conversation id as both the `session_id` header and `prompt_cache_key`,
 * and the backend routes requests that share it to where their prefix is
 * already cached. A thread keys by its id, so every turn and tool round of it
 * lands together; without a thread the instructions stand in, which groups the
 * calls of one agent or node. UUID-shaped like the CLI's own ids. Undefined
 * when there is nothing stable to key on.
 */
export function codexConversationId(
  threadId: string | null | undefined,
  instructions: string
): string | undefined {
  const source = threadId
    ? `thread:${threadId}`
    : instructions
      ? `system:${instructions}`
      : "";
  if (!source) return undefined;
  const hex = createHash("sha256")
    .update(`nodetool-codex:${source}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** A function call accumulated across Responses streaming events. */
interface PendingCall {
  callId: string;
  name: string;
  args: string;
}

/** The default headers a Codex client sends, with the account id when there is one. */
function codexDefaultHeaders(
  originator: string,
  accountId: string | null | undefined
) {
  const headers: Record<string, string> = { originator };
  if (accountId) {
    headers["chatgpt-account-id"] = accountId;
  }
  return headers;
}

export class CodexProvider extends OpenAIProvider {
  private defaultModel: Promise<string> | null = null;

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["CODEX_ACCESS_TOKEN"];
  }

  private readonly accessToken: string;
  private readonly accountId: string | null;
  private readonly originator: string;
  private readonly codexLogger: Logger;

  constructor(secrets: { CODEX_ACCESS_TOKEN?: string }) {
    const token = secrets.CODEX_ACCESS_TOKEN;
    if (!token) {
      throw new Error("CODEX_ACCESS_TOKEN is required");
    }
    const accountId = extractChatGptAccountId(token);
    const originator =
      (typeof process !== "undefined" && process.env?.CODEX_ORIGINATOR) ||
      CODEX_DEFAULT_ORIGINATOR;

    super(
      { OPENAI_API_KEY: token },
      {
        providerId: PROVIDER_IDS.CODEX,
        clientFactory: (key) =>
          new OpenAI({
            apiKey: key,
            baseURL: CODEX_BACKEND_BASE_URL,
            defaultHeaders: codexDefaultHeaders(originator, accountId)
          })
      }
    );
    this.accessToken = token;
    this.accountId = accountId;
    this.originator = originator;
    this.codexLogger = log;
  }

  /** The OAuth bearer is short-lived — never leak it into a container env. */
  override getContainerEnv() {
    return {};
  }

  /**
   * Return the account- and version-specific models served by Codex, minus
   * the ones Codex itself hides from its picker. Use {@link CODEX_FALLBACK_MODELS}
   * only when the live listing is unavailable or empty.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const url = `${CODEX_BACKEND_BASE_URL}/models?client_version=${encodeURIComponent(codexClientVersion())}`;
      const res = await fetch(url, {
        headers: this.buildHeaders("application/json")
      });
      if (!res.ok) return CODEX_FALLBACK_MODELS;
      const payload = (await res.json()) as {
        models?: Array<{
          slug?: string;
          display_name?: string;
          visibility?: string;
        }>;
      };
      const models = (payload.models ?? [])
        .filter(
          (m): m is { slug: string; display_name?: string } =>
            typeof m.slug === "string" &&
            m.slug.length > 0 &&
            m.visibility !== "hide"
        )
        .map((m) => ({
          id: m.slug,
          name: m.display_name ?? m.slug,
          provider: PROVIDER_IDS.CODEX
        }));
      return models.length > 0 ? models : CODEX_FALLBACK_MODELS;
    } catch {
      return CODEX_FALLBACK_MODELS;
    }
  }

  override async hasToolSupport(): Promise<boolean> {
    return true;
  }

  // --- Image generation (via the Responses image_generation tool) --------

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    // The Responses `image_generation` tool accepts a `model` field; every
    // gpt-image variant the OpenAI image API exposes works against the Codex
    // backend too (verified live).
    return [
      { id: "gpt-image-2", name: "GPT Image 2" },
      { id: "gpt-image-1.5", name: "GPT Image 1.5" },
      { id: "gpt-image-1", name: "GPT Image 1" },
      { id: "gpt-image-1-mini", name: "GPT Image 1 Mini" }
    ].map((m) => ({
      ...m,
      provider: PROVIDER_IDS.CODEX,
      supportedTasks: ["text_to_image"]
    }));
  }

  /**
   * The chat model that calls a built-in tool (`image_generation`,
   * `web_search`). The Codex backend has no images or search endpoint, and the
   * models it serves change by account and over time, so use the first model
   * of the live listing.
   */
  private resolveDefaultModel(): Promise<string> {
    this.defaultModel ??= this.getAvailableLanguageModels().then(
      (models) => models[0]?.id ?? CODEX_FALLBACK_MODELS[0].id
    );
    return this.defaultModel;
  }

  /**
   * Generate an image by asking a chat model to invoke the Responses built-in
   * `image_generation` tool, then extracting the PNG bytes from the
   * `image_generation_call` output item.
   */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }
    const prompt = sanitizeCodexControlTokens(
      params.negativePrompt
        ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
        : params.prompt
    );

    const imageTool: Record<string, unknown> = {
      type: "image_generation",
      model: params.model.id
    };
    const size = this.resolveImageSize(
      params.width ?? undefined,
      params.height ?? undefined
    );
    if (size) imageTool.size = size;
    if (params.quality) imageTool.quality = params.quality;

    const body = {
      model: await this.resolveDefaultModel(),
      instructions:
        "Generate the image the user describes by calling the image_generation tool. Do not ask clarifying questions.",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: prompt }]
        }
      ],
      tools: [imageTool],
      store: false,
      stream: true
    };

    const res = await fetch(`${CODEX_BACKEND_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw codexHttpError(
        `Codex image request failed (${res.status}): ${detail.slice(0, 300)}`,
        res.status
      );
    }

    let finalB64 = "";
    let lastPartial = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = rawEvent
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice("data:".length).trim();
          if (!payload || payload === "[DONE]") continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (
            event.type === "response.image_generation_call.partial_image" &&
            isString(event.partial_image_b64)
          ) {
            lastPartial = event.partial_image_b64;
          }
          if (event.type === "response.output_item.done") {
            const item = event.item as Record<string, unknown> | undefined;
            if (
              item?.type === "image_generation_call" &&
              isString(item.result)
            ) {
              finalB64 = item.result;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const b64 = finalB64 || lastPartial;
    if (!b64) {
      throw new Error("Codex image generation returned no image data.");
    }
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  // --- Web search (via the Responses web_search tool) --------------------

  /**
   * Answer a query with the Responses built-in `web_search` tool. The Codex
   * backend runs the search server-side, as it does for the Codex CLI.
   * Returns the answer and the pages it cites.
   */
  async webSearch(args: {
    query: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; sources: Array<{ title: string; url: string }> }> {
    const query = sanitizeCodexControlTokens(args.query).trim();
    if (!query) throw new Error("Search query cannot be empty");

    const body = {
      model: args.model || (await this.resolveDefaultModel()),
      instructions:
        "Search the web to answer the user's query from current information. Cite the pages you used.",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: query }]
        }
      ],
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      store: false,
      stream: true
    };

    const res = await fetch(`${CODEX_BACKEND_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: args.signal
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw codexHttpError(
        `Codex web search failed (${res.status}): ${detail.slice(0, 300)}`,
        res.status
      );
    }

    let streamed = "";
    const messages: string[] = [];
    const sources: Array<{ title: string; url: string }> = [];
    for await (const event of readSseEvents(res.body)) {
      if (event.type === "response.output_text.delta" && isString(event.delta)) {
        streamed += event.delta;
      } else if (event.type === "response.output_item.done") {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type !== "message" || !Array.isArray(item.content)) continue;
        for (const part of item.content as Array<Record<string, unknown>>) {
          if (part.type !== "output_text" || !isString(part.text)) continue;
          messages.push(part.text);
          const annotations = Array.isArray(part.annotations)
            ? (part.annotations as Array<Record<string, unknown>>)
            : [];
          for (const a of annotations) {
            if (a.type !== "url_citation" || !isString(a.url)) continue;
            if (sources.some((s) => s.url === a.url)) continue;
            sources.push({ title: isString(a.title) ? a.title : a.url, url: a.url });
          }
        }
      } else if (event.type === "response.failed" || event.type === "error") {
        const response = event.response as Record<string, unknown> | undefined;
        const error = (response?.error ?? event.error ?? event) as Record<string, unknown>;
        throw new Error(
          `Codex web search failed: ${isString(error.message) ? error.message : "unknown error"}`
        );
      }
    }

    const text = messages.length > 0 ? messages.join("\n") : streamed;
    if (!text) throw new Error("Codex web search returned no answer.");
    return { text, sources };
  }

  // --- Responses API transport -------------------------------------------

  private buildHeaders(accept = "text/event-stream", sessionId?: string) {
    const version = codexClientVersion();
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.accessToken}`,
      "content-type": "application/json",
      accept,
      originator: this.originator,
      "openai-beta": "responses=experimental",
      version,
      "user-agent": `${this.originator}/${version} (NodeTool)`,
      session_id: sessionId ?? globalThis.crypto.randomUUID()
    };
    if (this.accountId) {
      headers["chatgpt-account-id"] = this.accountId;
    }
    return headers;
  }

  /** Translate the cross-provider message list into Responses API input. */
  private buildRequestBody(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    threadId?: string | null;
  }) {
    const instructions = args.messages
      .filter((m) => m.role === "system")
      .map((m) => sanitizeCodexControlTokens(textOf(m.content)))
      .filter(Boolean)
      .join("\n\n");

    const input: Array<Record<string, unknown>> = [];
    for (const m of args.messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        input.push({
          type: "function_call_output",
          call_id: m.toolCallId ?? "",
          output: sanitizeCodexControlTokens(textOf(m.content))
        });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: sanitizeCodexControlTokens(
              JSON.stringify(tc.args ?? {})
            )
          });
        }
      }
      // Skip empty message items: an assistant tool-call round carries its
      // payload in the function_call items above and has no text of its own.
      // Emitting an empty output_text on every round-trip both bloats the
      // request and can confuse the backend.
      const text = sanitizeCodexControlTokens(textOf(m.content));
      if (!text) continue;
      const partType = m.role === "assistant" ? "output_text" : "input_text";
      input.push({
        type: "message",
        role: m.role,
        content: [{ type: partType, text }]
      });
    }

    const body: Record<string, unknown> = {
      model: args.model,
      instructions,
      input,
      store: false,
      stream: true
    };
    const conversationId = codexConversationId(args.threadId, instructions);
    if (conversationId) body.prompt_cache_key = conversationId;

    if (args.tools?.length) {
      body.tools = args.tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description ?? "",
        parameters: t.inputSchema ?? { type: "object", properties: {} },
        strict: false
      }));
      body.tool_choice =
        args.toolChoice && args.toolChoice !== "any"
          ? { type: "function", name: args.toolChoice }
          : args.toolChoice === "any"
            ? "required"
            : "auto";
    }

    return body;
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    maxTurns?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    threadId?: string | null;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const body = this.buildRequestBody(args);
    this.codexLogger.debug("Codex responses request", { model: args.model });

    this.recordRequestPayload(body);
    const res = await fetch(`${CODEX_BACKEND_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(
        "text/event-stream",
        isString(body.prompt_cache_key) ? body.prompt_cache_key : undefined
      ),
      body: JSON.stringify(body),
      signal: args.signal
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      this.codexLogger.warn("Codex responses request failed", {
        status: res.status,
        detail: detail.slice(0, 500)
      });
      throw codexHttpError(
        `Codex request failed (${res.status}): ${detail.slice(0, 300)}`,
        res.status
      );
    }

    const pending = new Map<string, PendingCall>();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminal = false;

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = rawEvent
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice("data:".length).trim();
          if (!payload || payload === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          for (const item of this.handleEvent(event, pending, args.model)) {
            if (!("args" in item) && item.done) {
              sawTerminal = true;
            }
            yield item;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // The SSE connection can close without a `response.completed` event (e.g.
    // the server drops the stream early). Consumers rely on a terminal
    // `done: true` chunk to know the turn is over, so synthesize one.
    if (!sawTerminal) {
      yield { type: "chunk", content: "", done: true };
    }
  }

  /** Map a single Responses SSE event to zero or more stream items. */
  private *handleEvent(
    event: Record<string, unknown>,
    pending: Map<string, PendingCall>,
    model: string
  ): Generator<Chunk | ToolCall> {
    const type = isString(event.type) ? event.type : "";

    switch (type) {
      case "response.output_text.delta": {
        const delta = isString(event.delta) ? event.delta : "";
        if (delta) {
          yield { type: "chunk", content: delta, done: false };
        }
        return;
      }
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_text.delta": {
        const delta = isString(event.delta) ? event.delta : "";
        if (delta) {
          yield {
            type: "chunk",
            content: delta,
            done: false,
            thinking: true
          };
        }
        return;
      }
      case "response.output_item.added": {
        const item = event.item as Record<string, unknown> | undefined;
        if (item?.type === "function_call") {
          const itemId = String(item.id ?? "");
          pending.set(itemId, {
            callId: String(item.call_id ?? itemId),
            name: String(item.name ?? ""),
            args: ""
          });
        }
        return;
      }
      case "response.function_call_arguments.delta": {
        const itemId = String(event.item_id ?? "");
        const call = pending.get(itemId);
        if (call && isString(event.delta)) {
          call.args += event.delta;
        }
        return;
      }
      case "response.output_item.done": {
        const item = event.item as Record<string, unknown> | undefined;
        const itemId = String(item?.id ?? "");
        const call = pending.get(itemId);
        if (call) {
          pending.delete(itemId);
          yield this.buildToolCall(call.callId, call.name, call.args);
        }
        return;
      }
      case "response.completed": {
        const response = event.response as Record<string, unknown> | undefined;
        const usage = response?.usage as Record<string, unknown> | undefined;
        if (usage) {
          this.trackUsage(model, {
            inputTokens: Number(usage.input_tokens ?? 0),
            outputTokens: Number(usage.output_tokens ?? 0),
            cachedTokens: Number(
              (usage.input_tokens_details as Record<string, unknown>)
                ?.cached_tokens ?? 0
            )
          });
        }
        yield { type: "chunk", content: "", done: true };
        return;
      }
      case "response.failed":
      case "error": {
        const err =
          (event.error as Record<string, unknown> | undefined) ??
          ((event.response as Record<string, unknown> | undefined)?.error as
            | Record<string, unknown>
            | undefined);
        const message =
          (err && isString(err.message) && err.message) ||
          "Codex response failed";
        throw new Error(message);
      }
      default:
        return;
    }
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    threadId?: string | null;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if (
        isProviderSessionUpdate(item) ||
        isProviderMessageEvent(item) ||
        isProviderStop(item)
      )
        continue;
      if ("args" in item) {
        toolCalls.push(item);
      } else if (!item.thinking && isString(item.content)) {
        content += item.content;
      }
    }
    return {
      role: "assistant",
      content: content || null,
      toolCalls: toolCalls.length ? toolCalls : null
    };
  }
}

/** Flatten a message's content to plain text. */
function textOf(content: Message["content"]): string {
  if (content == null) return "";
  if (isString(content)) return content;
  return content
    .filter(
      (c): c is Extract<MessageContent, { type: "text" }> => c.type === "text"
    )
    .map((c) => c.text)
    .join("");
}
