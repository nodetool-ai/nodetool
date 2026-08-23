import type { Chunk } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import { isNonEmptyString, isRecord, isString } from "../type-predicates.js";

const log = createLogger("nodetool.runtime.providers.ollama");
import type {
  EmbeddingModel,
  LanguageModel,
  Message,
  MessageContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

interface OllamaProviderOptions {
  fetchFn?: typeof fetch;
}

type OllamaToolCall = {
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

/**
 * Token counts Ollama reports on the final `/api/chat` object (and on the
 * non-streaming response). Cost is zero for a local model, the token counts
 * are not.
 */
type OllamaUsageFields = {
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaChatMessage = {
  role?: string;
  content?: string;
  // Reasoning models (e.g. gpt-oss, deepseek-r1) stream their chain of thought
  // here while `content` stays empty until reasoning finishes.
  thinking?: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
};

function parseDataUri(uri: string) {
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

function normalizeToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (isString(raw)) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (isRecord(raw)) {
    return raw;
  }
  return {};
}

function asTextParts(content: MessageContent[]): string {
  return content
    .filter((part): part is MessageTextContent => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export class OllamaProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["OLLAMA_API_URL"];
  }

  readonly apiUrl: string;
  /**
   * How long Ollama keeps the model resident after a request. Without this,
   * large models (e.g. the default gpt-oss:20b) get evicted between turns and
   * pay a multi-second reload on every message. Override with OLLAMA_KEEP_ALIVE
   * (accepts Ollama's duration syntax, e.g. "30m", "-1" to keep forever, "0" to
   * unload immediately).
   */
  readonly keepAlive: string;
  private _fetch: typeof fetch;

  constructor(
    secrets: { OLLAMA_API_URL?: string },
    options: OllamaProviderOptions = {}
  ) {
    super("ollama");
    const apiUrl = secrets.OLLAMA_API_URL ?? process.env.OLLAMA_API_URL;
    if (!apiUrl || !apiUrl.trim()) {
      throw new Error("OLLAMA_API_URL is required");
    }
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    const keepAlive = process.env.OLLAMA_KEEP_ALIVE?.trim();
    this.keepAlive = keepAlive && keepAlive.length > 0 ? keepAlive : "10m";
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv() {
    return { OLLAMA_API_URL: this.apiUrl };
  }

  /** Release cached model metadata held by this provider. */
  override async close(): Promise<void> {
    this._modelInfoCache.clear();
  }

  private _modelInfoCache = new Map<string, Record<string, unknown>>();

  /**
   * Check if a model supports native tool calling by querying /api/show.
   * Falls back to true if capabilities can't be determined.
   */
  async hasToolSupport(model: string): Promise<boolean> {
    try {
      let info = this._modelInfoCache.get(model);
      if (!info) {
        const response = await this._fetch(`${this.apiUrl}/api/show`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model })
        });
        if (!response.ok) {
          log.warn("Failed to fetch model info, assuming tool support", {
            model,
            status: response.status
          });
          return true;
        }
        info = (await response.json()) as Record<string, unknown>;
        this._modelInfoCache.set(model, info);
      }

      const capabilities = info.capabilities;
      if (Array.isArray(capabilities)) {
        return capabilities.includes("tools");
      }
      // No capabilities field — assume supported for backward compatibility
      return true;
    } catch (err) {
      log.warn("Error checking tool support, defaulting to true", {
        model,
        error: String(err)
      });
      return true;
    }
  }

  /**
   * Format tools as text descriptions for emulation injection into the system prompt.
   */
  private _formatToolsForEmulation(tools: ProviderTool[]): string {
    const lines: string[] = [];
    for (const tool of tools) {
      const params = tool.inputSchema?.properties
        ? Object.entries(
            tool.inputSchema.properties as Record<
              string,
              { type?: string; description?: string }
            >
          )
            .map(([name, prop]) => `${name}: ${prop.type ?? "any"}`)
            .join(", ")
        : "";
      lines.push(`- ${tool.name}(${params}): ${tool.description ?? ""}`);
    }
    return lines.join("\n");
  }

  /**
   * Parse emulated function calls from model output.
   * Returns [toolCalls, cleanedContent].
   */
  private _parseEmulatedToolCalls(
    content: string,
    tools: ProviderTool[]
  ): [ToolCall[], string] {
    const toolNames = new Set(tools.map((t) => t.name));
    const calls: ToolCall[] = [];
    let cleaned = content;

    // Match patterns like: function_name(key='value', key2=123)
    // or [func_name(key=value)]
    const funcPattern = /\[?\b(\w+)\(([^)]*)\)\]?/g;
    let match: RegExpExecArray | null;
    let callIndex = 0;

    while ((match = funcPattern.exec(content)) !== null) {
      const [fullMatch, name, argsStr] = match;
      if (!toolNames.has(name)) continue;

      // Parse key=value pairs
      const args: Record<string, unknown> = {};
      const argPattern = /(\w+)\s*=\s*(?:'([^']*)'|"([^"]*)"|(\S+))/g;
      let argMatch: RegExpExecArray | null;
      while ((argMatch = argPattern.exec(argsStr)) !== null) {
        const key = argMatch[1];
        // A quoted value ('…' or "…") is explicitly a string — never coerce it.
        const quoted = argMatch[2] !== undefined || argMatch[3] !== undefined;
        const value = argMatch[2] ?? argMatch[3] ?? argMatch[4];
        if (quoted) {
          args[key] = value;
        } else if (value === "true") {
          args[key] = true;
        } else if (value === "false") {
          args[key] = false;
        } else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
          // Only coerce STRICT decimal integers/floats. Leading-zero ("01234"),
          // exponent ("1e5"), hex ("0x10") and "Infinity" forms stay strings so
          // numeric-looking identifiers aren't corrupted.
          args[key] = Number(value);
        } else {
          args[key] = value;
        }
      }

      // Include a per-call index so repeated calls to the same tool within one
      // response (same Date.now() millisecond) get distinct ids.
      calls.push({
        id: `emulated-${name}-${Date.now()}-${callIndex}`,
        name,
        args
      });
      callIndex += 1;
      // replaceAll (not replace) so every occurrence of this call text is
      // stripped, not just the first.
      cleaned = cleaned.replaceAll(fullMatch, "").trim();
    }

    return [calls, cleaned];
  }

  private async imageToBase64(
    image: MessageImageContent["image"]
  ): Promise<string> {
    if (isString(image.data) && image.data.startsWith("data:")) {
      return parseDataUri(image.data).base64;
    }
    if (isString(image.uri) && image.uri.startsWith("data:")) {
      return parseDataUri(image.uri).base64;
    }
    if (isString(image.data)) {
      return image.data;
    }
    if (image.data instanceof Uint8Array) {
      return Buffer.from(image.data).toString("base64");
    }
    if (image.uri) {
      const resolved = await this.resolveUri(image.uri);
      if (resolved.startsWith("data:")) {
        return parseDataUri(resolved).base64;
      }
      const response = await this._fetch(resolved);
      if (!response.ok) {
        throw new Error(`Failed to fetch image URI: ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return Buffer.from(bytes).toString("base64");
    }
    throw new Error("Invalid image payload: expected uri or data");
  }

  async convertMessage(message: Message): Promise<Record<string, unknown>> {
    if (message.role === "tool") {
      const content = isString(message.content)
        ? message.content
        : JSON.stringify(message.content ?? null);
      return { role: "tool", content };
    }

    if (message.role === "assistant") {
      const out: Record<string, unknown> = {
        role: "assistant",
        // Flatten array-typed content like the system/user branches do; the
        // previous `: ""` silently erased a prior assistant turn stored as text
        // parts, dropping it from the replayed context.
        content: isString(message.content)
          ? message.content
          : Array.isArray(message.content)
            ? asTextParts(message.content)
            : ""
      };

      const toolCalls = message.toolCalls ?? [];
      if (toolCalls.length > 0) {
        out.tool_calls = toolCalls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: tc.args
          }
        }));
      }
      return out;
    }

    if (message.role === "system") {
      if (isString(message.content)) {
        return { role: "system", content: message.content };
      }
      if (Array.isArray(message.content)) {
        return { role: "system", content: asTextParts(message.content) };
      }
      return { role: "system", content: "" };
    }

    if (message.role !== "user") {
      throw new Error(`Unsupported message role: ${message.role}`);
    }

    if (isString(message.content)) {
      return { role: "user", content: message.content };
    }

    const parts = message.content ?? [];
    const text = asTextParts(parts);
    const images = await Promise.all(
      parts
        .filter(
          (part): part is MessageImageContent => part.type === "image_url"
        )
        .map((part) => this.imageToBase64(part.image))
    );

    const out: Record<string, unknown> = {
      role: "user",
      content: text
    };
    if (images.length > 0) {
      out.images = images;
    }
    return out;
  }

  formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", properties: {} }
      }
    }));
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const response = await this._fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) {
      throw new Error(`Ollama API request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._fetch(`${this.apiUrl}/api/tags`);
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const rows = payload.models ?? [];
    return rows
      .map((m) => m.model ?? m.name)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({
        id,
        name: id,
        provider: "ollama"
      }));
  }

  /**
   * Delete a model from the Ollama server's local store. Ollama answers
   * `DELETE /api/delete` with 200 on success and 404 when the model is not
   * installed; a 404 is reported as `false` rather than thrown, so a
   * double-delete is not an error.
   */
  async deleteModel(model: string): Promise<boolean> {
    const response = await this._fetch(`${this.apiUrl}/api/delete`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model })
    });
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Ollama delete failed (${response.status})`);
    }
    this._modelInfoCache.delete(model);
    return true;
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    const models = await this.getAvailableLanguageModels();
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: "ollama",
      dimensions: 0
    }));
  }

  private toToolCalls(toolCalls: OllamaToolCall[] | undefined): ToolCall[] {
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls
      .map((tc, idx) => {
        const fn = tc.function ?? {};
        const name = isString(fn.name) ? fn.name : "";
        if (!name) return null;
        return {
          id: `tool_${idx + 1}`,
          name,
          args: normalizeToolArgs(fn.arguments)
        } satisfies ToolCall;
      })
      .filter((tc): tc is ToolCall => tc !== null);
  }

  /**
   * Record the token counts Ollama reports on its final chat object. Local
   * models cost nothing, but the counts still belong in `llm_call` events and
   * `llm.chat`/`llm.stream` spans.
   */
  private trackOllamaUsage(model: string, payload: OllamaUsageFields): void {
    const inputTokens = payload.prompt_eval_count ?? 0;
    const outputTokens = payload.eval_count ?? 0;
    if (inputTokens === 0 && outputTokens === 0) return;
    this.trackUsage(model, { inputTokens, outputTokens });
  }

  private async buildChatRequest(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Record<string, unknown>> {
    // Ollama has one `repeat_penalty` knob rather than OpenAI's separate
    // presence/frequency penalties; prefer the explicit frequency penalty and
    // fall back to the presence penalty. Ollama's neutral value is 1.0 while
    // OpenAI's is 0.0, so shift by one.
    const repeatPenaltySource = args.frequencyPenalty ?? args.presencePenalty;
    const options: Record<string, unknown> = {
      num_predict: args.maxTokens ?? 8192
    };
    if (args.temperature != null) options.temperature = args.temperature;
    if (args.topP != null) options.top_p = args.topP;
    if (repeatPenaltySource != null) {
      options.repeat_penalty = 1 + repeatPenaltySource;
    }

    const request: Record<string, unknown> = {
      model: args.model,
      messages: await Promise.all(
        args.messages.map((m) => this.convertMessage(m))
      ),
      keep_alive: this.keepAlive,
      options
    };

    if (
      (args.tools ?? []).length > 0 &&
      (await this.hasToolSupport(args.model))
    ) {
      request.tools = this.formatTools(args.tools ?? []);
    }

    return request;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    signal?: AbortSignal;
  }): Promise<Message> {
    const tools = args.tools ?? [];
    const useToolEmulation =
      tools.length > 0 && !(await this.hasToolSupport(args.model));

    // For emulation, inject tool descriptions into messages and strip tools from request
    let messages = args.messages;
    let requestTools: ProviderTool[] | undefined = args.tools;
    if (useToolEmulation) {
      requestTools = undefined;
      messages = this._injectToolEmulationPrompt(messages, tools);
    }

    const request = await this.buildChatRequest({
      messages,
      model: args.model,
      tools: requestTools,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      topP: args.topP,
      presencePenalty: args.presencePenalty,
      frequencyPenalty: args.frequencyPenalty
    });
    request.stream = false;

    log.debug("Ollama request", { model: args.model });

    this.recordRequestPayload(request);
    const response = await this.postJson<
      { message?: OllamaChatMessage } & OllamaUsageFields
    >("/api/chat", request, args.signal);
    this.trackOllamaUsage(args.model, response);
    const message = response.message ?? {};
    const content = isString(message.content) ? message.content : "";

    let toolCalls: ToolCall[];
    let finalContent = content;
    if (useToolEmulation) {
      // Use the CLEANED content — the parser strips the literal call syntax.
      // Returning the raw content left `get_weather(city='Paris')` both as a
      // structured tool call AND as prose, which re-enters history and confuses
      // the model on later turns.
      const [emulatedCalls, cleaned] = this._parseEmulatedToolCalls(
        content,
        tools
      );
      toolCalls = emulatedCalls;
      if (emulatedCalls.length > 0) finalContent = cleaned;
    } else {
      toolCalls = this.toToolCalls(message.tool_calls);
    }

    return {
      role: "assistant",
      content: finalContent,
      toolCalls
    };
  }

  /**
   * Inject tool emulation instructions into the message list.
   * Prepends/appends tool descriptions to system message and converts tool messages to user messages.
   */
  private _injectToolEmulationPrompt(
    messages: Message[],
    tools: ProviderTool[]
  ): Message[] {
    const toolDescriptions = this._formatToolsForEmulation(tools);
    const emulationSuffix = `\n\nYou have access to these functions. Call them by writing: function_name(param='value')\n\n${toolDescriptions}\n\nWhen you need a function, write ONLY the function call. After receiving a result, use it in your answer.`;

    const result: Message[] = [];
    let systemFound = false;

    for (const msg of messages) {
      if (msg.role === "system" && !systemFound) {
        systemFound = true;
        const existingContent = isString(msg.content)
          ? msg.content
          : asTextParts(msg.content ?? []);
        result.push({ ...msg, content: existingContent + emulationSuffix });
      } else if (msg.role === "tool") {
        // Convert tool result to user message
        const toolContent = isString(msg.content)
          ? msg.content
          : JSON.stringify(msg.content ?? null);
        result.push({
          role: "user",
          content: `Function result: ${toolContent}`
        });
      } else {
        result.push(msg);
      }
    }

    // If no system message found, prepend one
    if (!systemFound) {
      result.unshift({ role: "system", content: emulationSuffix.trim() });
    }

    return result;
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const tools = args.tools ?? [];
    const useToolEmulation =
      tools.length > 0 && !(await this.hasToolSupport(args.model));

    // For emulation, inject tool descriptions into messages and strip tools from request
    let messages = args.messages;
    let requestTools: ProviderTool[] | undefined = args.tools;
    if (useToolEmulation) {
      requestTools = undefined;
      messages = this._injectToolEmulationPrompt(messages, tools);
    }

    const request = await this.buildChatRequest({
      messages,
      model: args.model,
      tools: requestTools,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
      topP: args.topP,
      presencePenalty: args.presencePenalty,
      frequencyPenalty: args.frequencyPenalty
    });
    request.stream = true;

    log.debug("Ollama request", { model: args.model });

    this.recordRequestPayload(request);
    const response = await this._fetch(`${this.apiUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: args.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama API request failed (${response.status})`);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const reader = response.body.getReader();
    let accumulatedText = "";

    try {
      while (true) {
        const read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });

        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx < 0) break;
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          const event = JSON.parse(line) as {
            message?: OllamaChatMessage;
            done?: boolean;
          } & OllamaUsageFields;
          if (event.done) this.trackOllamaUsage(args.model, event);
          const message = event.message ?? {};

          // Reasoning models stream their chain of thought in `thinking` while
          // `content` stays empty. Surface it as a thinking chunk so the UI
          // shows activity instead of appearing frozen until the answer lands.
          if (isNonEmptyString(message.thinking)) {
            const thinkingChunk: Chunk = {
              type: "chunk",
              content: message.thinking,
              done: false,
              thinking: true
            };
            yield thinkingChunk;
          }

          if (!useToolEmulation) {
            for (const tc of this.toToolCalls(message.tool_calls)) {
              yield tc;
            }
          }

          const content = isString(message.content) ? message.content : "";

          if (useToolEmulation) {
            // Buffer content instead of streaming it verbatim: the emulated
            // tool-call syntax (e.g. `get_weather(city='Paris')`) must be
            // stripped from the visible text before it re-enters history, and
            // that can only happen once the full response is assembled. Mirrors
            // the non-streaming generateMessage path, which had this fix (#1)
            // while the streaming path leaked the raw call syntax as prose.
            accumulatedText += content;
            if (event.done) {
              const [emulatedCalls, cleaned] = this._parseEmulatedToolCalls(
                accumulatedText,
                tools
              );
              const finalContent =
                emulatedCalls.length > 0 ? cleaned : accumulatedText;
              if (finalContent.length > 0) {
                const contentChunk: Chunk = {
                  type: "chunk",
                  content: finalContent,
                  done: false
                };
                yield contentChunk;
              }
              // Tool calls before the terminal chunk so consumers that finalize
              // on `done: true` don't drop them.
              for (const tc of emulatedCalls) {
                yield tc;
              }
              const doneChunk: Chunk = {
                type: "chunk",
                content: "",
                done: true
              };
              yield doneChunk;
            }
          } else if (content.length > 0 || event.done) {
            const chunk: Chunk = {
              type: "chunk",
              content,
              done: event.done ?? false
            };
            yield chunk;
          }
        }
      }
    } finally {
      // Stop the underlying connection if the consumer bails early (abort /
      // break); releasing the lock alone leaves the HTTP body undrained.
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const values = Array.isArray(args.text) ? args.text : [args.text];
    if (values.length === 0 || values.some((v) => !isNonEmptyString(v))) {
      throw new Error("text must not be empty");
    }
    const response = await this.postJson<{ embeddings?: number[][] }>(
      "/api/embed",
      {
        model: args.model,
        input: values
      }
    );
    return response.embeddings ?? [];
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("context window") ||
      msg.includes("token limit") ||
      msg.includes("request too large") ||
      msg.includes("413")
    );
  }
}
