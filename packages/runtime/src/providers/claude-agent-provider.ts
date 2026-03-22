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
 * Tool support: when tools are provided, their schemas are injected into the
 * system prompt and Claude is instructed to respond with a JSON tool_calls
 * array. The provider parses this and yields ToolCall items.
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
  ToolCall,
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.claude_agent");

const CLAUDE_AGENT_MODELS: LanguageModel[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "claude_agent" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "claude_agent" },
  { id: "claude-haiku-4-20250514", name: "Claude Haiku 4", provider: "claude_agent" },
];

/** Built-in Claude Code tools we disable — we only want text generation. */
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
  "TaskOutput",
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
 * Build a tool-calling instruction block to inject into the system prompt.
 */
function buildToolPrompt(tools: ProviderTool[]): string {
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    parameters: t.inputSchema ?? {},
  }));

  return `

## Available Tools

You have access to the following tools. When you need to use a tool, respond with ONLY
a JSON object in this exact format (no markdown, no extra text before or after):

{"tool_calls": [{"name": "<tool_name>", "args": {<arguments>}}]}

You may call multiple tools at once by adding multiple entries to the array.
If you don't need to use any tools, respond with normal text.

Tools:
${JSON.stringify(toolDefs, null, 2)}
`;
}

/**
 * Try to parse tool calls from the assistant's response text.
 * Returns parsed tool calls and any remaining text, or null if no tool calls found.
 */
function parseToolCalls(
  text: string,
): { toolCalls: Array<{ name: string; args: Record<string, unknown> }>; remainingText: string } | null {
  // Look for JSON with tool_calls key anywhere in the text
  const trimmed = text.trim();

  // Try direct JSON parse first (the ideal case — response is only JSON)
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      return { toolCalls: parsed.tool_calls, remainingText: "" };
    }
  } catch {
    // not pure JSON
  }

  // Try to find JSON block in the text
  const jsonMatch = trimmed.match(/\{[\s\S]*"tool_calls"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        const remaining = trimmed.replace(jsonMatch[0], "").trim();
        return { toolCalls: parsed.tool_calls, remainingText: remaining };
      }
    } catch {
      // malformed JSON
    }
  }

  return null;
}

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
   * When tools are provided, append tool-calling instructions to the system prompt.
   */
  private extractPrompt(
    messages: Message[],
    tools?: ProviderTool[],
  ): {
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

    if (tools && tools.length > 0) {
      systemPrompt += buildToolPrompt(tools);
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
  private async getQueryFn(): Promise<
    typeof import("@anthropic-ai/claude-agent-sdk").query
  > {
    try {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      return sdk.query;
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
  }): AsyncGenerator<ProviderStreamItem> {
    const queryFn = await this.getQueryFn();
    const hasTools = (args.tools?.length ?? 0) > 0;
    const { systemPrompt, prompt } = this.extractPrompt(args.messages, args.tools);
    const threadId = args.threadId ?? null;

    const resumeSessionId = this.getSessionId(threadId);

    log.debug("Claude Agent request", {
      model: args.model,
      promptLength: prompt.length,
      threadId,
      resuming: !!resumeSessionId,
      tools: hasTools ? args.tools!.map((t) => t.name) : [],
    });

    // Unset CLAUDECODE to allow running inside a Claude Code session (e.g. when
    // the nodetool server is itself launched from Claude Code).
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE;

    const queryHandle = queryFn({
      prompt,
      options: {
        model: args.model,
        systemPrompt,
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        disallowedTools: DISALLOWED_TOOLS,
        allowedTools: [],
        env: cleanEnv,
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      },
    });

    // When tools are present we buffer the full response to parse tool calls.
    // When no tools, we stream text as before.
    let streamedTextLength = 0;
    let assistantHandled = false;
    let fullResponseText = "";

    for await (const msg of queryHandle) {
      const msgObj = msg as Record<string, unknown>;
      const msgType = msgObj.type as string;

      // Capture session ID from the init event so we can resume later.
      if (
        msgType === "system" &&
        msgObj.subtype === "init" &&
        typeof msgObj.session_id === "string" &&
        threadId
      ) {
        this.setSessionId(threadId, msgObj.session_id);
        log.debug("Claude session initialized", {
          threadId,
          sessionId: msgObj.session_id,
        });
        continue;
      }

      // Stream events provide incremental text updates during generation.
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
            // Only stream if no tools — with tools we need to buffer for parsing
            if (!hasTools) {
              yield { type: "chunk", content: delta, done: false } as Chunk;
            }
            fullResponseText = text;
          }
        }
        continue;
      }

      // Full assistant message — capture final text.
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
            if (!hasTools) {
              yield { type: "chunk", content: delta, done: false } as Chunk;
            }
          }
          fullResponseText = text;
        }
        assistantHandled = true;
        continue;
      }

      // Result event — fallback if no assistant message was received.
      if (msgType === "result" && !assistantHandled) {
        const result = msgObj.result;
        if (typeof result === "string" && result.length > 0) {
          if (!hasTools) {
            yield { type: "chunk", content: result, done: false } as Chunk;
          }
          fullResponseText = result;
        }
      }
    }

    // If tools were provided, check if the response contains tool calls.
    if (hasTools && fullResponseText) {
      const parsed = parseToolCalls(fullResponseText);
      if (parsed) {
        // Emit any remaining text before tool calls
        if (parsed.remainingText) {
          yield { type: "chunk", content: parsed.remainingText, done: false } as Chunk;
        }
        // Yield each tool call
        let callIndex = 0;
        for (const tc of parsed.toolCalls) {
          const args = (tc.args && typeof tc.args === "object" && !Array.isArray(tc.args))
            ? tc.args as Record<string, unknown>
            : {};
          const toolCall: ToolCall = {
            id: `call_${Date.now()}_${callIndex++}`,
            name: tc.name,
            args,
          };
          log.debug("Tool call parsed", { name: tc.name, args });
          yield toolCall;
        }
        return; // Don't emit done chunk — tool calls signal continuation
      }
      // No tool calls found — emit the buffered text as chunks
      yield { type: "chunk", content: fullResponseText, done: false } as Chunk;
    }

    // Final done signal.
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
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
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
