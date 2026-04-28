import OpenAI from "openai";
import type { Chunk } from "@nodetool-ai/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

interface LlamaProviderOptions {
  client?: OpenAI;
  clientFactory?: (baseUrl: string) => OpenAI;
  fetchFn?: typeof fetch;
}

interface MutableToolCall {
  id: string;
  name: string;
  arguments: string;
}

function parseKeywordArgs(raw: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const src = raw.trim();
  if (!src) return args;

  const parts: string[] = [];
  let buf = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      buf += ch;
      if (ch === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const valueRaw = part.slice(eq + 1).trim();
    if (!key) continue;

    if (
      (valueRaw.startsWith("{") && valueRaw.endsWith("}")) ||
      (valueRaw.startsWith("[") && valueRaw.endsWith("]"))
    ) {
      try {
        args[key] = JSON.parse(valueRaw);
        continue;
      } catch {
        // fall through
      }
    }

    if (
      (valueRaw.startsWith('"') && valueRaw.endsWith('"')) ||
      (valueRaw.startsWith("'") && valueRaw.endsWith("'"))
    ) {
      args[key] = valueRaw.slice(1, -1);
      continue;
    }

    if (valueRaw === "true" || valueRaw === "false") {
      args[key] = valueRaw === "true";
      continue;
    }

    if (valueRaw === "null") {
      args[key] = null;
      continue;
    }

    const num = Number(valueRaw);
    if (Number.isFinite(num)) {
      args[key] = num;
      continue;
    }

    args[key] = valueRaw;
  }

  return args;
}

function parseEmulatedToolCalls(
  content: string,
  tools: ProviderTool[]
): { toolCalls: ToolCall[]; cleanedContent: string } {
  const lines = content.split("\n");
  const cleaned: string[] = [];
  const calls: ToolCall[] = [];

  const allowed = new Set(tools.map((t) => t.name));
  const callPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$/;
  for (const line of lines) {
    const match = line.match(callPattern);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const name = match[1];
    if (allowed.size > 0 && !allowed.has(name)) {
      cleaned.push(line);
      continue;
    }
    const args = parseKeywordArgs(match[2] ?? "");
    calls.push({
      id: `tool_${calls.length + 1}`,
      name,
      args
    });
  }

  return {
    toolCalls: calls,
    cleanedContent: cleaned.join("\n").trim()
  };
}

function asTextContent(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function contentToString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return asTextContent(content);
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export class LlamaProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["LLAMA_CPP_URL"];
  }

  readonly baseUrl: string;
  private _client: OpenAI | null;
  private _clientFactory: (baseUrl: string) => OpenAI;
  private _fetch: typeof fetch;

  constructor(
    secrets: { LLAMA_CPP_URL?: string },
    options: LlamaProviderOptions = {}
  ) {
    super("llama_cpp");

    const raw = secrets.LLAMA_CPP_URL ?? process.env.LLAMA_CPP_URL;
    if (!raw || !raw.trim()) {
      throw new Error("LLAMA_CPP_URL is required");
    }
    const normalized = raw.replace(/\/+$/, "");

    this.baseUrl = normalized;
    this._client = options.client ?? null;
    this._clientFactory =
      options.clientFactory ??
      ((url) =>
        new OpenAI({
          apiKey: "sk-no-key-required",
          baseURL: `${url}/v1`
        }));
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv(): Record<string, string> {
    // Python provider intentionally does not inject env for container execution.
    return {};
  }

  private getClient(): OpenAI {
    if (!this._client) {
      this._client = this._clientFactory(this.baseUrl);
    }
    return this._client;
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    // Python provider returns False and relies on tool emulation.
    return false;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._fetch(`${this.baseUrl}/v1/models`);
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ id?: string }>;
    };
    const rows = payload.data ?? payload.models ?? [];
    return rows
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({ id, name: id, provider: "llama_cpp" }));
  }

  private async normalizeMessagesForLlama(
    messages: Message[]
  ): Promise<Message[]> {
    const systemParts: string[] = [];
    const normalized: Message[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(asTextContent(msg.content));
        continue;
      }
      if (msg.role === "tool") {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content ?? null);
        normalized.push({
          role: "user",
          content: `Tool result:\n${content}`
        });
        continue;
      }
      normalized.push(msg);
    }

    const out: Message[] = [];
    if (systemParts.length > 0) {
      out.push({
        role: "system",
        content: systemParts.filter(Boolean).join("\n")
      });
    }

    // Ensure post-system strict alternation (user/assistant/user/assistant...).
    const seq = normalized;
    const startExpected: Array<"user" | "assistant"> = ["user"];
    let expected = startExpected[0];
    for (const msg of seq) {
      const mappedRole: "user" | "assistant" =
        msg.role === "assistant" ? "assistant" : "user";
      while (mappedRole !== expected) {
        out.push({ role: expected, content: "" });
        expected = expected === "user" ? "assistant" : "user";
      }
      out.push({ ...msg, role: mappedRole });
      expected = expected === "user" ? "assistant" : "user";
    }

    return out;
  }

  async convertMessage(message: Message): Promise<Record<string, unknown>> {
    if (message.role === "assistant") {
      const toolCalls = (message.toolCalls ?? []).map((tc) => ({
        type: "function",
        id: tc.id,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args)
        }
      }));
      return {
        role: "assistant",
        content: asTextContent(message.content),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
      };
    }

    if (message.role === "system") {
      return { role: "system", content: asTextContent(message.content) };
    }

    if (message.role === "tool") {
      return {
        role: "user",
        content: `Tool result:\n${contentToString(message.content)}`
      };
    }

    return { role: "user", content: asTextContent(message.content) };
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
  }): AsyncGenerator<ProviderStreamItem> {
    const {
      model,
      tools = [],
      maxTokens = 1024
    } = args;

    const normalized = await this.normalizeMessagesForLlama(args.messages);
    const openaiMessages = await Promise.all(
      normalized.map((m) => this.convertMessage(m))
    );

    const request: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      stream: true
    };
    if (tools.length > 0 && (await this.hasToolSupport(model))) {
      request.tools = this.formatTools(tools);
    }

    const stream = (await this.getClient().chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
    )) as AsyncIterable<any> & { close?: () => Promise<void> };

    const deltaToolCalls = new Map<number, MutableToolCall>();
    let accumulatedText = "";

    try {
      for await (const chunk of stream) {
        const choice = chunk?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const index = Number(tc.index ?? 0);
            const cur = deltaToolCalls.get(index) ?? {
              id: String(tc.id ?? ""),
              name: "",
              arguments: ""
            };
            if (tc.id) cur.id = String(tc.id);
            if (tc.function?.name) cur.name = String(tc.function.name);
            if (tc.function?.arguments)
              cur.arguments += String(tc.function.arguments);
            deltaToolCalls.set(index, cur);
          }
        }

        const content = String(delta?.content ?? "");
        if (content.length > 0) {
          accumulatedText += content;
        }

        if (content.length > 0 || choice.finish_reason === "stop") {
          const out: Chunk = {
            type: "chunk",
            content,
            done: choice.finish_reason === "stop"
          };
          yield out;
        }

        if (choice.finish_reason === "tool_calls") {
          for (const call of deltaToolCalls.values()) {
            yield this.buildToolCall(call.id, call.name, call.arguments);
          }
          deltaToolCalls.clear();
        }

        if (
          choice.finish_reason === "stop" &&
          tools.length > 0 &&
          !(await this.hasToolSupport(model))
        ) {
          const parsed = parseEmulatedToolCalls(accumulatedText, tools);
          for (const tc of parsed.toolCalls) {
            yield tc;
          }
        }
      }
    } finally {
      if (typeof stream.close === "function") {
        await stream.close();
      }
    }
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
  }): Promise<Message> {
    const {
      model,
      tools = [],
      maxTokens = 1024
    } = args;

    const normalized = await this.normalizeMessagesForLlama(args.messages);
    const openaiMessages = await Promise.all(
      normalized.map((m) => this.convertMessage(m))
    );

    const request: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      stream: false
    };
    if (tools.length > 0 && (await this.hasToolSupport(model))) {
      request.tools = this.formatTools(tools);
    }

    const completion = await this.getClient().chat.completions.create(
      request as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );
    const message = completion.choices?.[0]?.message;
    const content = String(message?.content ?? "");

    let toolCalls: ToolCall[] = [];
    const nativeToolCalls = message?.tool_calls ?? [];
    if (nativeToolCalls.length > 0) {
      toolCalls = nativeToolCalls.map((tc: any) =>
        this.buildToolCall(
          String(tc.id ?? ""),
          String(tc.function?.name ?? ""),
          tc.function?.arguments
        )
      );
    } else if (tools.length > 0 && !(await this.hasToolSupport(model))) {
      toolCalls = parseEmulatedToolCalls(content, tools).toolCalls;
    }

    return {
      role: "assistant",
      content,
      toolCalls
    };
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
