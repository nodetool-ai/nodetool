/**
 * Claude Agent Provider
 *
 * Uses the Claude Agent SDK (@anthropic-ai/claude-agent-sdk) to interact with
 * Claude through the user's Claude subscription (Claude Pro/Max/Team).
 *
 * Requirements:
 * - Claude Code CLI installed and authenticated (`claude` command available)
 * - Active Claude subscription
 * - @anthropic-ai/claude-agent-sdk package installed
 *
 * This provider does NOT require an ANTHROPIC_API_KEY — it uses the Claude Code
 * session which authenticates through the user's Claude subscription.
 *
 * Tool support: tools are exposed as an in-process MCP server via the SDK's
 * createSdkMcpServer() + tool() helpers. Claude calls tools natively through
 * the MCP protocol; the provider yields ToolCall items for tracking.
 * An onToolCall callback must be supplied for tool execution.
 */

import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool/config";
import type { Chunk } from "@nodetool/protocol";
import type {
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.claude_agent");

const MCP_SERVER_NAME = "nodetool-tools";

const CLAUDE_AGENT_MODELS: LanguageModel[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "claude_agent"
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "claude_agent"
  },
  {
    id: "claude-haiku-4-20250514",
    name: "Claude Haiku 4",
    provider: "claude_agent"
  }
];

/** Built-in Claude Code tools we disable — we only want text generation + our MCP tools. */
const DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput"
];

function extractText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is MessageTextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return String(content ?? "");
}

/**
 * Convert a JSON Schema property to a Zod type.
 * Handles the common subset used by agent tools.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>, z: any): any {
  const type = prop.type as string | undefined;
  const enumValues = prop.enum as unknown[] | undefined;

  if (enumValues && Array.isArray(enumValues)) {
    // z.enum requires string literals
    if (enumValues.every((v) => typeof v === "string")) {
      return z.enum(enumValues as [string, ...string[]]);
    }
    return z.any();
  }

  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = prop.items as Record<string, unknown> | undefined;
      if (items) {
        return z.array(jsonSchemaPropertyToZod(items, z));
      }
      return z.array(z.any());
    }
    case "object": {
      const properties = prop.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties) {
        const shape: Record<string, unknown> = {};
        const required = (prop.required as string[]) ?? [];
        for (const [key, val] of Object.entries(properties)) {
          let zodType = jsonSchemaPropertyToZod(val, z);
          if (!required.includes(key)) {
            zodType = zodType.optional();
          }
          shape[key] = zodType;
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.any());
    }
    default:
      return z.any();
  }
}

/**
 * Convert a ProviderTool's JSON Schema inputSchema to a Zod raw shape
 * suitable for the SDK's tool() function.
 */
function jsonSchemaToZodShape(
  schema: Record<string, unknown> | undefined,
  z: any
): Record<string, unknown> {
  if (!schema) return {};
  const properties = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return {};

  const required = (schema.required as string[]) ?? [];
  const shape: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType = jsonSchemaPropertyToZod(prop, z);
    if (!required.includes(key)) {
      zodType = zodType.optional();
    }
    if (typeof prop.description === "string") {
      zodType = zodType.describe(prop.description);
    }
    shape[key] = zodType;
  }

  return shape;
}

/**
 * Callback type for tool execution.
 * The provider calls this when Claude invokes a tool via MCP.
 * Returns the tool result as a string.
 */
export type OnToolCall = (
  name: string,
  args: Record<string, unknown>
) => Promise<string>;

export class ClaudeAgentProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return [];
  }

  /**
   * Maps threadId → Claude SDK session ID.
   * Allows resuming conversations across multiple generateMessages() calls.
   */
  private _sessions = new Map<string, string>();

  constructor(_secrets: Record<string, unknown> = {}) {
    super("claude_agent");
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return CLAUDE_AGENT_MODELS;
  }

  /**
   * Extract the system prompt and the last user message from the messages array.
   */
  private extractPrompt(messages: Message[]): {
    systemPrompt: string;
    prompt: string;
  } {
    let systemPrompt = "You are a helpful assistant.";
    let prompt = "";

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = extractText(msg.content);
      }
    }

    // Walk backwards to find the last user message — that's our prompt.
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        prompt = extractText(messages[i].content);
        break;
      }
    }

    if (!prompt) {
      prompt = "Hello";
    }

    return { systemPrompt, prompt };
  }

  /**
   * Dynamically import the Agent SDK. Throws a descriptive error if not installed.
   */
  private async getSdk(): Promise<
    typeof import("@anthropic-ai/claude-agent-sdk")
  > {
    try {
      return await import("@anthropic-ai/claude-agent-sdk");
    } catch {
      throw new Error(
        "Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is not installed or Claude Code " +
          "is not available. Install Claude Code and run: npm install @anthropic-ai/claude-agent-sdk"
      );
    }
  }

  /** Look up an existing Claude session for the given threadId. */
  getSessionId(threadId: string | null): string | undefined {
    if (!threadId) return undefined;
    return this._sessions.get(threadId);
  }

  /** Store the Claude session ID for a threadId. */
  setSessionId(threadId: string, sessionId: string): void {
    this._sessions.set(threadId, sessionId);
  }

  /** Remove a stored session (e.g. when a conversation is closed). */
  clearSession(threadId: string): void {
    this._sessions.delete(threadId);
  }

  /**
   * Build an in-process MCP server from ProviderTool definitions.
   * Each tool's handler calls the onToolCall callback.
   */
  private buildMcpServer(
    tools: ProviderTool[],
    onToolCall: OnToolCall,
    sdk: typeof import("@anthropic-ai/claude-agent-sdk"),
    z: any,
    toolCallTracker: ToolCall[]
  ) {
    const mcpTools = tools.map((t) => {
      const zodShape = jsonSchemaToZodShape(t.inputSchema, z) as any;
      return sdk.tool(
        t.name,
        t.description ?? "",
        zodShape,
        async (args: Record<string, unknown>) => {
          // Track the tool call for yielding to the caller
          const toolCall: ToolCall = {
            id: `call_${Date.now()}_${toolCallTracker.length}`,
            name: t.name,
            args
          };
          toolCallTracker.push(toolCall);
          log.debug("MCP tool called", { name: t.name, args });

          try {
            const result = await onToolCall(t.name, args);
            return { content: [{ type: "text" as const, text: result }] };
          } catch (e) {
            const errorMsg = `Tool execution error: ${e}`;
            log.error("MCP tool error", { name: t.name, error: errorMsg });
            return {
              content: [{ type: "text" as const, text: errorMsg }],
              isError: true
            };
          }
        }
      );
    });

    return sdk.createSdkMcpServer({
      name: MCP_SERVER_NAME,
      version: "1.0.0",
      tools: mcpTools
    });
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    thinkingBudget?: number;
    threadId?: string | null;
    /** Callback for tool execution. Required when tools are provided. */
    onToolCall?: OnToolCall;
  }): AsyncGenerator<ProviderStreamItem> {
    const sdk = await this.getSdk();
    const hasTools = (args.tools?.length ?? 0) > 0 && !!args.onToolCall;
    const { systemPrompt, prompt } = this.extractPrompt(args.messages);
    const threadId = args.threadId ?? null;
    const resumeSessionId = this.getSessionId(threadId);

    // Track tool calls made during this query (populated by MCP handlers)
    const toolCallTracker: ToolCall[] = [];

    // Build MCP server if tools + callback provided
    let mcpServer: ReturnType<typeof sdk.createSdkMcpServer> | undefined;
    let allowedTools: string[] = [];

    if (hasTools && args.tools && args.onToolCall) {
      const { z } = await import("zod");
      mcpServer = this.buildMcpServer(
        args.tools,
        args.onToolCall,
        sdk,
        z,
        toolCallTracker
      );
      allowedTools = args.tools.map(
        (t) => `mcp__${MCP_SERVER_NAME}__${t.name}`
      );
    }

    log.debug("Claude Agent request", {
      model: args.model,
      promptLength: prompt.length,
      threadId,
      resuming: !!resumeSessionId,
      tools: hasTools ? args.tools!.map((t) => t.name) : [],
      mcpEnabled: !!mcpServer
    });

    // Unset CLAUDECODE to allow running inside a Claude Code session
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE;

    const queryHandle = sdk.query({
      prompt,
      options: {
        model: args.model,
        systemPrompt,
        maxTurns: hasTools ? 10 : 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        disallowedTools: DISALLOWED_TOOLS,
        allowedTools,
        env: cleanEnv,
        ...(mcpServer ? { mcpServers: { [MCP_SERVER_NAME]: mcpServer } } : {}),
        ...(resumeSessionId ? { resume: resumeSessionId } : {})
      }
    });

    // streamedTextLength tracks the text position within the current assistant turn.
    // It resets when a new turn begins (after tool execution in multi-turn MCP queries).
    let streamedTextLength = 0;
    let yieldedToolCallCount = 0;
    // Track whether we already yielded text via stream_event/assistant messages
    // so we can skip the duplicate result event.
    let hasYieldedText = false;

    for await (const msg of queryHandle) {
      const msgObj = msg as Record<string, unknown>;
      const msgType = msgObj.type as string;

      // Capture session ID from the init event
      if (
        msgType === "system" &&
        msgObj.subtype === "init" &&
        typeof msgObj.session_id === "string" &&
        threadId
      ) {
        this.setSessionId(threadId, msgObj.session_id);
        log.debug("Claude session initialized", {
          threadId,
          sessionId: msgObj.session_id
        });
        continue;
      }

      // Yield any new tool calls that were tracked by MCP handlers.
      // When tool calls appear, a new assistant turn follows — reset text position.
      if (yieldedToolCallCount < toolCallTracker.length) {
        while (yieldedToolCallCount < toolCallTracker.length) {
          yield toolCallTracker[yieldedToolCallCount++];
        }
        // Reset for the next assistant turn's text
        streamedTextLength = 0;
      }

      // Stream events provide incremental text updates
      if (msgType === "stream_event") {
        const partial = msgObj.message as Record<string, unknown> | undefined;
        const content = partial?.content;
        if (Array.isArray(content)) {
          const text = content
            .filter(
              (b: any) => b?.type === "text" && typeof b.text === "string"
            )
            .map((b: any) => b.text as string)
            .join("");
          if (text.length > streamedTextLength) {
            const delta = text.slice(streamedTextLength);
            streamedTextLength = text.length;
            hasYieldedText = true;
            yield { type: "chunk", content: delta, done: false } as Chunk;
          }
        }
        continue;
      }

      // Full assistant message — emit any remaining text not covered by stream events
      if (msgType === "assistant") {
        const message = msgObj.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (Array.isArray(content)) {
          const text = content
            .filter(
              (b: any) => b?.type === "text" && typeof b.text === "string"
            )
            .map((b: any) => b.text as string)
            .join("");
          if (text.length > streamedTextLength) {
            const delta = text.slice(streamedTextLength);
            streamedTextLength = text.length;
            hasYieldedText = true;
            yield { type: "chunk", content: delta, done: false } as Chunk;
          }
        }
        // Reset for next turn (if multi-turn agentic query)
        streamedTextLength = 0;
        continue;
      }

      // Result event — final text fallback, only if nothing was streamed yet
      if (msgType === "result" && !hasYieldedText) {
        const result = msgObj.result;
        if (typeof result === "string" && result.length > 0) {
          yield { type: "chunk", content: result, done: false } as Chunk;
        }
      }
    }

    // Yield any remaining tool calls
    while (yieldedToolCallCount < toolCallTracker.length) {
      yield toolCallTracker[yieldedToolCallCount++];
    }

    // Final done signal
    yield { type: "chunk", content: "", done: true } as Chunk;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    thinkingBudget?: number;
    threadId?: string | null;
    onToolCall?: OnToolCall;
  }): Promise<Message> {
    const parts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if ("type" in item && (item as Chunk).type === "chunk") {
        const chunk = item as Chunk;
        if (chunk.content) parts.push(chunk.content);
      }
      if ("id" in item && "name" in item && "args" in item) {
        toolCalls.push(item as ToolCall);
      }
    }
    return {
      role: "assistant",
      content: parts.join(""),
      ...(toolCalls.length > 0 ? { toolCalls } : {})
    };
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
