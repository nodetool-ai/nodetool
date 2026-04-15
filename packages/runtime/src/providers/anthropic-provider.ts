import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
  MessageStreamParams
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { Chunk } from "@nodetool/protocol";
import { createLogger } from "@nodetool/config";
import { BaseProvider } from "./base-provider.js";

const log = createLogger("nodetool.runtime.providers.anthropic");
import type {
  LanguageModel,
  Message,
  MessageContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

interface AnthropicProviderOptions {
  client?: Anthropic;
  clientFactory?: (apiKey: string) => Anthropic;
  fetchFn?: typeof fetch;
}


function isTextContent(content: MessageContent): content is MessageTextContent {
  return content.type === "text";
}

function isImageContent(
  content: MessageContent
): content is MessageImageContent {
  return content.type === "image";
}

function bytesToBase64(data: Uint8Array | string | undefined): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  return Buffer.from(data).toString("base64");
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
  static requiredSecrets(): string[] {
    return ["ANTHROPIC_API_KEY"];
  }

  readonly apiKey: string;
  private _client: Anthropic | null;
  private _clientFactory: (apiKey: string) => Anthropic;
  private _fetch: typeof fetch;

  constructor(
    secrets: { ANTHROPIC_API_KEY?: string },
    options: AnthropicProviderOptions = {}
  ) {
    super("anthropic");

    const apiKey = secrets.ANTHROPIC_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    this.apiKey = apiKey;
    this._client = options.client ?? null;
    this._clientFactory =
      options.clientFactory ??
      ((key) =>
        new Anthropic({
          apiKey: key
        }));
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv(): Record<string, string> {
    return { ANTHROPIC_API_KEY: this.apiKey };
  }

  getClient(): Anthropic {
    if (!this._client) {
      this._client = this._clientFactory(this.apiKey);
    }
    return this._client;
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const maxRetries = 3;
    const baseDelay = 1000; // ms

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000); // 10s total timeout

        const response = await this._fetch(
          "https://api.anthropic.com/v1/models",
          {
            headers: {
              "x-api-key": this.apiKey,
              "anthropic-version": "2023-06-01"
            },
            signal: controller.signal
          }
        );
        clearTimeout(timeout);

        // Don't retry on auth errors
        if (response.status === 401 || response.status === 403) {
          log.warn("Anthropic API auth error, not retrying", {
            status: response.status
          });
          return [];
        }

        // Retry on rate limit or server errors
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          log.warn("Anthropic API error, retrying", {
            status: response.status,
            attempt: attempt + 1,
            maxRetries
          });
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
            continue;
          }
          return [];
        }

        if (!response.ok) {
          log.warn("Failed to fetch Anthropic models", {
            status: response.status
          });
          return [];
        }

        const payload = (await response.json()) as {
          data?: Array<{ id?: string; name?: string }>;
        };

        return (payload.data ?? [])
          .map((m) => m.id ?? m.name)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .map((id) => ({ id, name: id, provider: "anthropic" }));
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // AbortError means timeout
        if (lastError.name === "AbortError") {
          log.warn("Anthropic API timeout", {
            attempt: attempt + 1,
            maxRetries
          });
        } else {
          log.warn("Anthropic API connection error", {
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries
          });
        }

        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
        }
      }
    }

    log.error("Failed to fetch Anthropic models after retries", {
      error: lastError?.message
    });
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

    const unsupported = [
      "default",
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "minLength",
      "maxLength",
      "minProperties",
      "maxProperties",
      "minItems",
      "maxItems",
      "uniqueItems"
    ];

    for (const key of unsupported) {
      delete obj[key];
    }

    return obj;
  }

  async convertMessage(
    message: Message
  ): Promise<Record<string, unknown> | null> {
    if (message.role === "tool") {
      if (!message.toolCallId) {
        throw new Error("Tool call ID must not be None");
      }

      const contentValue =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content ?? null);

      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: contentValue
          }
        ]
      };
    }

    if (message.role === "system") {
      return {
        role: "assistant",
        content:
          typeof message.content === "string"
            ? message.content
            : String(message.content ?? "")
      };
    }

    if (message.role === "user") {
      if (typeof message.content === "string") {
        return { role: "user", content: message.content };
      }

      const parts = message.content ?? [];
      const content: Array<Record<string, unknown>> = [];

      for (const part of parts) {
        if (isTextContent(part)) {
          content.push({ type: "text", text: part.text });
          continue;
        }
        if (isImageContent(part)) {
          const rawData = bytesToBase64(part.image.data);
          const uri = part.image.uri ?? "";

          let mediaType = part.image.mimeType ?? "image/png";
          let base64: string;

          if (rawData) {
            if (rawData.startsWith("data:")) {
              const parsed = parseDataUri(rawData);
              base64 = parsed.base64;
              mediaType = part.image.mimeType ?? parsed.mime;
            } else {
              base64 = rawData;
            }
          } else if (uri.startsWith("data:")) {
            const parsed = parseDataUri(uri);
            base64 = parsed.base64;
            mediaType = part.image.mimeType ?? parsed.mime;
          } else if (uri) {
            const response = await this._fetch(this.resolveUri(uri));
            if (!response.ok) {
              throw new Error(`Failed to fetch URI: ${response.status}`);
            }
            mediaType =
              part.image.mimeType ??
              response.headers.get("content-type") ??
              "image/png";
            base64 = Buffer.from(
              new Uint8Array(await response.arrayBuffer())
            ).toString("base64");
          } else {
            throw new Error("Invalid image reference with no uri or data");
          }

          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64
            }
          });
        }
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
      const contentBlocks: Array<Record<string, unknown>> = [];
      if (typeof message.content === "string" && message.content.trim()) {
        contentBlocks.push({ type: "text", text: message.content });
      }

      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (isTextContent(part) && part.text.trim()) {
            contentBlocks.push({ type: "text", text: part.text });
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
          .map((part) => ({
            type: "text",
            text: (part as MessageTextContent).text
          }))
      };
    }

    throw new Error(`Unknown message content type ${typeof message.content}`);
  }

  formatTools(tools: ProviderTool[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: this.prepareJsonSchema(
        tool.inputSchema ?? { type: "object", properties: {} }
      )
    }));
  }


  private extractSystemMessage(messages: Message[]): string {
    const system = messages.find((m) => m.role === "system");
    if (!system) {
      return "You are a helpful assistant.";
    }

    if (typeof system.content === "string") {
      return system.content;
    }

    if (Array.isArray(system.content)) {
      return system.content
        .filter((part) => isTextContent(part))
        .map((part) => (part as MessageTextContent).text)
        .join(" ");
    }

    return String(system.content ?? "You are a helpful assistant.");
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
    thinkingBudget?: number;
  }): AsyncGenerator<ProviderStreamItem> {
    const system = this.extractSystemMessage(args.messages);
    const converted = await Promise.all(
      args.messages
        .filter((m) => m.role !== "system")
        .map((m) => this.convertMessage(m))
    );
    const anthropicMessages = converted.filter(
      (m): m is Record<string, unknown> => m !== null
    );

    const formattedTools = args.tools && args.tools.length > 0
      ? this.formatTools(args.tools)
      : undefined;

    let resolvedToolChoice: Record<string, unknown> | undefined;
    if (args.toolChoice) {
      resolvedToolChoice =
        args.toolChoice === "any"
          ? { type: "any" }
          : { type: "tool", name: args.toolChoice };
    }

    const request: Record<string, unknown> = {
      model: args.model,
      messages: anthropicMessages,
      system,
      max_tokens: args.maxTokens ?? 8192,
      ...(formattedTools ? { tools: formattedTools } : {}),
      ...(resolvedToolChoice ? { tool_choice: resolvedToolChoice } : {}),
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {}),
      ...(args.thinkingBudget != null
        ? { thinking: { type: "enabled", budget_tokens: args.thinkingBudget } }
        : {})
    };

    log.debug("Anthropic request", { model: args.model });

    const stream = await this.getClient().messages.create({
      ...(request as unknown as MessageStreamParams),
      stream: true
    });

    let streamInputTokens = 0;
    let streamOutputTokens = 0;
    let streamCachedTokens = 0;

    // Track in-flight tool_use blocks: index → { id, name, accumulated partial_json }
    const activeToolBlocks = new Map<
      number,
      { id: string; name: string; json: string }
    >();

    for await (const event of stream) {
      if (event.type === "message_start") {
        const usage = event.message.usage;
        streamInputTokens += usage.input_tokens ?? 0;
        streamCachedTokens += usage.cache_read_input_tokens ?? 0;
      }

      if (event.type === "message_delta") {
        streamOutputTokens += event.usage.output_tokens ?? 0;
      }

      if (event.type === "message_stop") {
        this.trackUsage(args.model, {
          inputTokens: streamInputTokens,
          outputTokens: streamOutputTokens,
          cachedTokens: streamCachedTokens
        });
      }

      // Record the start of a tool_use content block so we can accumulate its JSON.
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "tool_use") {
          activeToolBlocks.set(event.index, {
            id: String(block.id ?? ""),
            name: String(block.name ?? ""),
            json: ""
          });
        }
        continue;
      }

      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if ("thinking" in delta && typeof delta.thinking === "string") {
          const chunk: Chunk = {
            type: "chunk",
            content: delta.thinking,
            done: false,
            thinking: true
          };
          yield chunk;
          continue;
        }

        if (
          "partial_json" in delta &&
          typeof delta.partial_json === "string"
        ) {
          // Regular tool call: accumulate the JSON into the active block.
          const block = activeToolBlocks.get(event.index);
          if (block) {
            block.json += delta.partial_json;
          }
          continue;
        }

        if (
          "text" in delta &&
          typeof delta.text === "string"
        ) {
          const chunk: Chunk = {
            type: "chunk",
            content: delta.text,
            done: false
          };
          yield chunk;
        }
        continue;
      }

      if (event.type === "content_block_stop") {
        // content_block_stop does NOT carry the content_block in the raw API event.
        // Use the block we recorded from content_block_start + accumulated partial_json.
        const index = event.index;
        const toolBlock = activeToolBlocks.get(index);
        if (toolBlock) {
          activeToolBlocks.delete(index);
          let parsedArgs: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(toolBlock.json || "{}");
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              parsedArgs = parsed as Record<string, unknown>;
            }
          } catch {
            // malformed JSON — emit empty args
          }
          const toolCall: ToolCall = {
            id: toolBlock.id,
            name: toolBlock.name,
            args: parsedArgs
          };
          yield toolCall;
        }
        continue;
      }

      if (event.type === "message_stop") {
        const chunk: Chunk = {
          type: "chunk",
          content: "",
          done: true
        };
        yield chunk;
      }
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
    thinkingBudget?: number;
  }): Promise<Message> {
    const system = this.extractSystemMessage(args.messages);
    const converted = await Promise.all(
      args.messages
        .filter((m) => m.role !== "system")
        .map((m) => this.convertMessage(m))
    );
    const anthropicMessages = converted.filter(
      (m): m is Record<string, unknown> => m !== null
    );

    const formattedTools = args.tools && args.tools.length > 0
      ? this.formatTools(args.tools)
      : undefined;

    let resolvedToolChoice: Record<string, unknown> | undefined;
    if (args.toolChoice) {
      resolvedToolChoice =
        args.toolChoice === "any"
          ? { type: "any" }
          : { type: "tool", name: args.toolChoice };
    }

    const request: Record<string, unknown> = {
      model: args.model,
      messages: anthropicMessages,
      system,
      max_tokens: args.maxTokens ?? 8192,
      ...(formattedTools ? { tools: formattedTools } : {}),
      ...(resolvedToolChoice ? { tool_choice: resolvedToolChoice } : {}),
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {}),
      ...(args.thinkingBudget != null
        ? { thinking: { type: "enabled", budget_tokens: args.thinkingBudget } }
        : {})
    };

    log.debug("Anthropic request", { model: args.model });

    const response = await this.getClient().messages.create(
      request as unknown as MessageCreateParamsNonStreaming
    );

    if (response.usage) {
      this.trackUsage(args.model, {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        cachedTokens: response.usage.cache_read_input_tokens ?? 0
      });
    }

    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of response.content ?? []) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          args: (block.input ?? {}) as Record<string, unknown>
        });
        continue;
      }
      if (block.type === "text") {
        textParts.push(String(block.text ?? ""));
      }
    }

    return {
      role: "assistant",
      content: textParts.join("\n"),
      toolCalls
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
