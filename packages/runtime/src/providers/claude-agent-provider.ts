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
import { createLogger } from "@nodetool-ai/config";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";
import * as sdk from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const log = createLogger("nodetool.runtime.providers.claude_agent");

const MCP_SERVER_NAME = "nodetool-tools";

/**
 * Categories of failures surfaced by the Claude Agent provider.
 * Used to give the user actionable guidance rather than a raw SDK message.
 */
export type ClaudeAgentErrorKind =
  | "sdk_not_installed"
  | "cli_not_found"
  | "running_as_root"
  | "auth"
  | "rate_limit"
  | "context_length"
  | "invalid_model"
  | "aborted"
  | "max_turns"
  | "execution"
  | "unknown";

/**
 * Error thrown by the Claude Agent provider. Carries a categorised `kind`
 * alongside a user-facing message so callers (UI, CLI) can decide how to
 * render the failure (e.g. show a "Sign in" button for `auth`).
 */
export class ClaudeAgentError extends Error {
  readonly kind: ClaudeAgentErrorKind;

  constructor(kind: ClaudeAgentErrorKind, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "ClaudeAgentError";
    this.kind = kind;
  }
}

/**
 * Classify a raw error from the Claude Agent SDK (or its child process) into
 * a ClaudeAgentError with an actionable, user-facing message.
 */
export function classifyClaudeAgentError(error: unknown): ClaudeAgentError {
  if (error instanceof ClaudeAgentError) return error;

  const original = error instanceof Error ? error.message : String(error);
  const lower = original.toLowerCase();

  // SDK package itself not installed (optional dependency missing).
  if (
    lower.includes("cannot find module") &&
    lower.includes("claude-agent-sdk")
  ) {
    return new ClaudeAgentError(
      "sdk_not_installed",
      "The @anthropic-ai/claude-agent-sdk package is not installed. " +
        "The Claude Agent provider requires this optional dependency — install it with " +
        "`npm install @anthropic-ai/claude-agent-sdk`, then restart NodeTool. " +
        `Original error: ${original}`,
      error
    );
  }

  // Claude Code CLI binary not on PATH.
  if (
    lower.includes("enoent") ||
    lower.includes("claude: not found") ||
    lower.includes("command not found: claude") ||
    (lower.includes("spawn") && lower.includes("claude"))
  ) {
    return new ClaudeAgentError(
      "cli_not_found",
      "Claude Code CLI not found on PATH. The Claude Agent provider spawns the " +
        "`claude` command — install it from https://docs.anthropic.com/claude-code/install " +
        "(or via `npm install -g @anthropic-ai/claude-code`), then run `claude login` to " +
        `authenticate. Original error: ${original}`,
      error
    );
  }

  // Running as root — SDK refuses --dangerously-skip-permissions.
  if (
    lower.includes("dangerously-skip-permissions") ||
    (lower.includes("root") && lower.includes("refus")) ||
    (lower.includes("uid") && lower.includes("0"))
  ) {
    return new ClaudeAgentError(
      "running_as_root",
      "The Claude Agent SDK refuses to run as root (uid=0) because it passes " +
        "--dangerously-skip-permissions to the Claude CLI. Run NodeTool as a non-root " +
        "user, or switch to the `anthropic` provider which uses ANTHROPIC_API_KEY " +
        `directly. Original error: ${original}`,
      error
    );
  }

  // Abort.
  if (
    lower.includes("abort") ||
    error instanceof Error && error.name === "AbortError"
  ) {
    return new ClaudeAgentError(
      "aborted",
      "Claude Agent request was aborted.",
      error
    );
  }

  // Authentication failure.
  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("forbidden") ||
    lower.includes("not logged in") ||
    lower.includes("not authenticated") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication") ||
    lower.includes("oauth")
  ) {
    return new ClaudeAgentError(
      "auth",
      "Claude Agent authentication failed. Run `claude login` in a terminal to " +
        "sign in with your Claude subscription, or set ANTHROPIC_API_KEY. " +
        `Original error: ${original}`,
      error
    );
  }

  // Rate limit.
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return new ClaudeAgentError(
      "rate_limit",
      "Claude Agent rate limit reached. Wait a moment and retry, or check your " +
        `Claude subscription usage limits. Original error: ${original}`,
      error
    );
  }

  // Context length.
  if (
    lower.includes("context length") ||
    lower.includes("context window") ||
    lower.includes("token limit") ||
    lower.includes("maximum context") ||
    lower.includes("too long") ||
    lower.includes("prompt is too long")
  ) {
    return new ClaudeAgentError(
      "context_length",
      "Claude Agent request exceeded the model's context window. Shorten the " +
        "conversation (clear older messages) or switch to a model with a larger " +
        `context window. Original error: ${original}`,
      error
    );
  }

  // Invalid / unknown model.
  if (
    lower.includes("model") &&
    (lower.includes("invalid") ||
      lower.includes("not found") ||
      lower.includes("unknown") ||
      lower.includes("does not exist"))
  ) {
    return new ClaudeAgentError(
      "invalid_model",
      "Claude Agent could not use the requested model. Check that the model ID " +
        "is valid and available on your Claude subscription. " +
        `Original error: ${original}`,
      error
    );
  }

  return new ClaudeAgentError(
    "unknown",
    `Claude Agent provider error: ${original}`,
    error
  );
}

const CLAUDE_AGENT_MODELS: LanguageModel[] = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "claude_agent"
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "claude_agent"
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "claude_agent"
  }
];

const DISALLOWED_TOOLS: string[] = [];

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
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
    thinkingBudget?: number;
    threadId?: string | null;
    /** Callback for tool execution. Required when tools are provided. */
    onToolCall?: OnToolCall;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const toolCount = args.tools?.length ?? 0;
    const hasOnToolCall = !!args.onToolCall;
    const hasTools = toolCount > 0 && hasOnToolCall;
    const { systemPrompt, prompt } = this.extractPrompt(args.messages);
    const threadId = args.threadId ?? null;
    const resumeSessionId = this.getSessionId(threadId);

    // Pre-flight: fail fast with a clear message if running as root, since the
    // SDK always refuses --dangerously-skip-permissions for uid=0. Without this
    // check the underlying error surfaces as an opaque child-process failure.
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      throw new ClaudeAgentError(
        "running_as_root",
        "The Claude Agent SDK refuses to run as root (uid=0) because it passes " +
          "--dangerously-skip-permissions to the Claude CLI. Run NodeTool as a " +
          "non-root user, or use the `anthropic` provider with ANTHROPIC_API_KEY."
      );
    }

    log.info("Claude Agent generateMessages called", {
      toolCount,
      hasOnToolCall,
      hasTools,
      toolNames: args.tools?.map((t) => t.name) ?? []
    });

    // Track tool calls made during this query (populated by MCP handlers)
    const toolCallTracker: ToolCall[] = [];

    // Build MCP server if tools + callback provided
    let mcpServer: ReturnType<typeof sdk.createSdkMcpServer> | undefined;
    let allowedTools: string[] = [];

    if (hasTools && args.tools && args.onToolCall) {
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
      log.info("MCP server built", {
        mcpToolCount: args.tools.length,
        allowedTools
      });
    }

    log.info("Claude Agent request", {
      model: args.model,
      promptLength: prompt.length,
      threadId,
      resuming: !!resumeSessionId,
      tools: hasTools ? args.tools!.map((t) => t.name) : [],
      mcpEnabled: !!mcpServer
    });

    // Strip all Claude Code env vars to allow running inside a Claude Code session.
    // Just deleting CLAUDECODE/CLAUDE_CODE is not enough — the SDK inherits
    // session IDs, proxy settings, auth tokens, etc. that conflict with
    // spawning a nested Claude Code process.
    const cleanEnv = { ...process.env };
    for (const key of Object.keys(cleanEnv)) {
      if (
        key === "CLAUDECODE" ||
        key === "CLAUDE_CODE" ||
        key.startsWith("CLAUDE_CODE_") ||
        key.startsWith("CLAUDE_SESSION_") ||
        key.startsWith("CLAUDE_ENABLE_") ||
        key.startsWith("CLAUDE_AFTER_") ||
        key.startsWith("CLAUDE_AUTO_")
      ) {
        delete cleanEnv[key];
      }
    }

    // Bridge AbortSignal → AbortController for the SDK
    let abortController: AbortController | undefined;
    if (args.signal) {
      abortController = new AbortController();
      if (args.signal.aborted) {
        abortController.abort();
      } else {
        args.signal.addEventListener(
          "abort",
          () => abortController!.abort(),
          { once: true }
        );
      }
    }

    let queryHandle: ReturnType<typeof sdk.query>;
    try {
      queryHandle = sdk.query({
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
          ...(abortController ? { abortController } : {}),
          ...(mcpServer
            ? { mcpServers: { [MCP_SERVER_NAME]: mcpServer } }
            : {}),
          ...(resumeSessionId ? { resume: resumeSessionId } : {})
        }
      });
    } catch (err) {
      const classified = classifyClaudeAgentError(err);
      log.error("Claude Agent sdk.query() failed", {
        kind: classified.kind,
        error: classified.message,
        model: args.model
      });
      throw classified;
    }

    // streamedTextLength tracks the text position within the current assistant turn.
    // It resets when a new turn begins (after tool execution in multi-turn MCP queries).
    let streamedTextLength = 0;
    let yieldedToolCallCount = 0;
    // Track whether we already yielded text via stream_event/assistant messages
    // so we can skip the duplicate result event.
    let hasYieldedText = false;

    try {
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

        // Result event — surface errors and fall back text when nothing was streamed.
        if (msgType === "result") {
          const subtype = msgObj.subtype as string | undefined;
          const isError = msgObj.is_error === true;
          const rawResult = msgObj.result;
          const resultText =
            typeof rawResult === "string" ? rawResult : undefined;

          if (isError || (subtype && subtype.startsWith("error"))) {
            const detail = resultText ?? this.describeErrorSubtype(subtype);
            const kind: ClaudeAgentErrorKind =
              subtype === "error_max_turns"
                ? "max_turns"
                : subtype === "error_during_execution"
                  ? "execution"
                  : "unknown";
            const message =
              kind === "max_turns"
                ? `Claude Agent stopped after reaching the max turn limit without ` +
                  `finishing. Increase maxTurns, simplify the task, or break it into ` +
                  `smaller steps. Detail: ${detail}`
                : kind === "execution"
                  ? `Claude Agent execution error: ${detail}`
                  : `Claude Agent returned an error result (${
                      subtype ?? "unknown"
                    }): ${detail}`;
            log.error("Claude Agent result error", {
              subtype,
              is_error: isError,
              detail
            });
            throw new ClaudeAgentError(kind, message);
          }

          if (!hasYieldedText && resultText && resultText.length > 0) {
            yield { type: "chunk", content: resultText, done: false } as Chunk;
          }
        }
      }
    } catch (err) {
      const classified = classifyClaudeAgentError(err);
      log.error("Claude Agent stream failed", {
        kind: classified.kind,
        error: classified.message,
        model: args.model
      });
      throw classified;
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

  private describeErrorSubtype(subtype: string | undefined): string {
    switch (subtype) {
      case "error_max_turns":
        return "agent reached the maximum number of turns";
      case "error_during_execution":
        return "an error occurred during agent execution";
      default:
        return subtype ?? "unknown error";
    }
  }

  isContextLengthError(error: unknown): boolean {
    if (error instanceof ClaudeAgentError) return error.kind === "context_length";
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("context window") ||
      msg.includes("token limit") ||
      msg.includes("too long") ||
      msg.includes("maximum context")
    );
  }

  isAuthError(error: unknown): boolean {
    if (error instanceof ClaudeAgentError) return error.kind === "auth";
    return super.isAuthError(error);
  }

  isRateLimitError(error: unknown): boolean {
    if (error instanceof ClaudeAgentError) return error.kind === "rate_limit";
    return super.isRateLimitError(error);
  }
}
