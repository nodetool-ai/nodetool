/**
 * CodexProvider — OpenAI models on the user's ChatGPT plan, reached through
 * Sign in with ChatGPT instead of an API key.
 *
 * Follows OpenAI's guide
 * (https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt): the
 * OAuth access token calls the public Responses API at
 * `https://api.openai.com/v1/responses` with `store: false` and
 * `stream: true`, and `GET /v1/models` lists the models the signed-in account
 * can use. ChatGPT's private `backend-api` routes are not used. The provider
 * drives the Responses API directly and parses its SSE event stream.
 *
 * The bearer is the short-lived OAuth access token, resolved (and refreshed)
 * by the host through `getSecret("CODEX_ACCESS_TOKEN")` and passed in as a
 * constructor kwarg — exactly how the registry wires every other credentialed
 * provider.
 */

import OpenAI from "openai";
import { createLogger, type Logger } from "@nodetool-ai/config";
import {
  CHATGPT_API_BASE_URL,
  CHATGPT_USAGE_SETTINGS_URL,
  PROVIDER_IDS,
  isString,
  type Chunk
} from "@nodetool-ai/protocol";
import { OpenAIProvider } from "./openai-provider.js";
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
 * Models ChatGPT plans list, shown only when the live `/v1/models` listing is
 * unavailable.
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

/**
 * Recovery text for the structured errors the plan route returns, from
 * OpenAI's errors and recovery guide.
 */
const CHATGPT_ERROR_MESSAGES: Record<string, string> = {
  subscription_sharing_usage_limit_exceeded: `You reached your ChatGPT plan's usage limit. Check your usage at ${CHATGPT_USAGE_SETTINGS_URL}.`,
  subscription_sharing_usage_unavailable:
    "ChatGPT could not check your plan usage right now. Try again shortly.",
  subscription_sharing_user_not_eligible:
    "Your ChatGPT plan, workspace or policy does not allow NodeTool to use it.",
  subscription_sharing_user_unavailable:
    "ChatGPT account information is temporarily unavailable. Try again shortly.",
  subscription_sharing_invalid_user:
    "Your ChatGPT sign-in is no longer valid. Sign in with ChatGPT again.",
  subscription_sharing_route_not_supported:
    "This request is not available on a ChatGPT plan.",
  chatpass_v2_scope_not_authorized:
    "NodeTool is not allowed to use your ChatGPT plan. Sign in with ChatGPT again and allow plan usage.",
  chatpass_v2_invalid_authorization_context:
    "NodeTool is not allowed to use your ChatGPT plan. Sign in with ChatGPT again and allow plan usage."
};

function errorObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return record;
}

/**
 * A user-facing message for a failed ChatGPT plan request. `detail` is the
 * parsed error body, a `response.failed` response, or an `error` event.
 */
export function chatGptErrorMessage(
  detail: unknown,
  status: number | null,
  fallback: string
): string {
  const error = errorObject(detail);
  const code = error && isString(error.code) ? error.code : null;
  if (code === "subscription_sharing_unsupported_capability") {
    const param = isString(error?.param) ? error.param : null;
    return param
      ? `A ChatGPT plan does not support "${param}" in this request.`
      : "A ChatGPT plan does not support part of this request.";
  }
  if (code && CHATGPT_ERROR_MESSAGES[code]) return CHATGPT_ERROR_MESSAGES[code];
  if (status === 401) {
    return "Your ChatGPT sign-in was not accepted. Sign in with ChatGPT again.";
  }
  if (status === 403) {
    return "ChatGPT blocked this request by policy, for example the serving region.";
  }
  if (status === 503) {
    return "ChatGPT plan usage is unavailable right now. Try again shortly.";
  }
  const message = error && isString(error.message) ? error.message : null;
  return message ? `${fallback}: ${message}` : fallback;
}

/**
 * A failed ChatGPT request. The status rides on the error so the provider
 * layer classifies a 401 as an expired sign-in, which its message alone does
 * not reveal.
 */
function chatGptHttpError(message: string, status: number | null): Error {
  return status === null
    ? new Error(message)
    : Object.assign(new Error(message), { status });
}

/** Turn a non-OK response into a {@link chatGptHttpError}. */
async function failedResponseError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text().catch(() => "");
  let detail: unknown;
  try {
    detail = JSON.parse(text);
  } catch {
    detail = text ? { message: text.slice(0, 300) } : null;
  }
  return chatGptHttpError(
    chatGptErrorMessage(detail, res.status, `${fallback} (${res.status})`),
    res.status
  );
}

/** Throw for a `response.failed` or `error` stream event. */
function streamEventError(event: Record<string, unknown>, fallback: string): Error {
  const detail =
    event.type === "response.failed"
      ? (event.response as Record<string, unknown> | undefined)
      : event;
  const error = errorObject(detail);
  const status = typeof error?.status === "number" ? error.status : null;
  return chatGptHttpError(chatGptErrorMessage(detail, status, fallback), status);
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

/** A function call accumulated across Responses streaming events. */
interface PendingCall {
  callId: string;
  name: string;
  args: string;
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
  private readonly codexLogger: Logger;

  constructor(secrets: { CODEX_ACCESS_TOKEN?: string }) {
    const token = secrets.CODEX_ACCESS_TOKEN;
    if (!token) {
      throw new Error("CODEX_ACCESS_TOKEN is required");
    }

    super(
      { OPENAI_API_KEY: token },
      {
        providerId: PROVIDER_IDS.CODEX,
        // The plan token belongs to a ChatGPT account, not a Platform
        // organization or project, and plan usage errors must not be retried.
        clientFactory: (key) =>
          new OpenAI({
            apiKey: key,
            baseURL: CHATGPT_API_BASE_URL,
            organization: null,
            project: null,
            maxRetries: 0,
            defaultHeaders: {
              "openai-organization": null,
              "openai-project": null
            }
          })
      }
    );
    this.accessToken = token;
    this.codexLogger = log;
  }

  /** The OAuth bearer is short-lived — never leak it into a container env. */
  override getContainerEnv() {
    return {};
  }

  /**
   * Return the models the signed-in account can use, from `GET /v1/models`:
   * entries with `visibility: "list"`, in the server's order, named by their
   * `display_name`. Use {@link CODEX_FALLBACK_MODELS} only when the live
   * listing is unavailable or empty.
   */
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      const res = await fetch(`${CHATGPT_API_BASE_URL}/models`, {
        headers: this.buildHeaders("application/json"),
        redirect: "error"
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
            m.visibility === "list"
        )
        .map((m) => ({
          id: m.slug,
          name: m.display_name?.trim() || m.slug,
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
    // Pass the selected image model to the Responses image_generation tool.
    return [
      { id: "gpt-image-2.6-flare", name: "GPT Image 2.6 Flare" },
      { id: "gpt-image-2.6-sunburst", name: "GPT Image 2.6 Sunburst" },
      { id: "gpt-image-2", name: "GPT Image 2" },
      { id: "gpt-image-1.5", name: "GPT Image 1.5" },
      { id: "gpt-image-1-mini", name: "GPT Image 1 Mini" }
    ].map((m) => ({
      ...m,
      provider: PROVIDER_IDS.CODEX,
      supportedTasks: ["text_to_image"]
    }));
  }

  /**
   * The chat model that calls a built-in tool (`image_generation`,
   * `web_search`). A plan token reaches only the Responses API, and the models
   * it can use change by account and over time, so use the first model of the
   * live listing.
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
      params.height ?? undefined,
      params.model.id
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

    const res = await fetch(`${CHATGPT_API_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      redirect: "error"
    });
    if (!res.ok || !res.body) {
      throw await failedResponseError(res, "ChatGPT image request failed");
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
          if (event.type === "response.failed" || event.type === "error") {
            throw streamEventError(event, "ChatGPT image generation failed");
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
      throw new Error("ChatGPT image generation returned no image data.");
    }
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  // --- Web search (via the Responses web_search tool) --------------------

  /**
   * Answer a query with the Responses built-in `web_search` tool, which runs
   * the search server-side. Returns the answer and the pages it cites.
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

    const res = await fetch(`${CHATGPT_API_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: args.signal,
      redirect: "error"
    });
    if (!res.ok || !res.body) {
      throw await failedResponseError(res, "ChatGPT web search failed");
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
        throw streamEventError(event, "ChatGPT web search failed");
      }
    }

    const text = messages.length > 0 ? messages.join("\n") : streamed;
    if (!text) throw new Error("ChatGPT web search returned no answer.");
    return { text, sources };
  }

  // --- Responses API transport -------------------------------------------

  private buildHeaders(accept = "text/event-stream"): Record<string, string> {
    return {
      authorization: `Bearer ${this.accessToken}`,
      "content-type": "application/json",
      accept
    };
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
    this.codexLogger.debug("ChatGPT responses request", { model: args.model });

    this.recordRequestPayload(body);
    const res = await fetch(`${CHATGPT_API_BASE_URL}/responses`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: args.signal,
      redirect: "error"
    });

    if (!res.ok || !res.body) {
      const error = await failedResponseError(res, "ChatGPT request failed");
      this.codexLogger.warn("ChatGPT responses request failed", {
        status: res.status,
        error: error.message
      });
      throw error;
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
      case "response.completed":
      case "response.incomplete": {
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
      case "error":
        throw streamEventError(event, "ChatGPT response failed");
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
