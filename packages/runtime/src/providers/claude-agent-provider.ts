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
 * Conversation history is managed via Claude sessions (resume: sessionId)
 * rather than re-sending the full message array on each call.
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
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.claude_agent");

const CLAUDE_AGENT_MODELS: LanguageModel[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "claude_agent" },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "claude_agent" },
  { id: "claude-haiku-4-20250514", name: "Claude Haiku 4", provider: "claude_agent" },
];

/** Built-in Claude Code tools we disable since we only want text generation. */
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
    return false;
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return CLAUDE_AGENT_MODELS;
  }

  /**
   * Extract the system prompt and the last user message from the messages array.
   * With session-based history, only the latest user message is sent as the prompt.
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
    const { systemPrompt, prompt } = this.extractPrompt(args.messages);
    const threadId = args.threadId ?? null;

    const resumeSessionId = this.getSessionId(threadId);

    log.debug("Claude Agent request", {
      model: args.model,
      promptLength: prompt.length,
      threadId,
      resuming: !!resumeSessionId,
    });

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
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      },
    });

    // Track streamed text length to compute deltas from cumulative stream events.
    let streamedTextLength = 0;
    let assistantHandled = false;

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
          const fullText = content
            .filter(
              (b: any) => b?.type === "text" && typeof b.text === "string"
            )
            .map((b: any) => b.text as string)
            .join("");
          // Stream events are cumulative — emit only the new delta.
          if (fullText.length > streamedTextLength) {
            const delta = fullText.slice(streamedTextLength);
            streamedTextLength = fullText.length;
            yield { type: "chunk", content: delta, done: false } as Chunk;
          }
        }
        continue;
      }

      // Full assistant message — only emit text not already streamed.
      if (msgType === "assistant") {
        const message = msgObj.message as Record<string, unknown> | undefined;
        const content = message?.content;
        if (Array.isArray(content)) {
          const fullText = content
            .filter(
              (b: any) => b?.type === "text" && typeof b.text === "string"
            )
            .map((b: any) => b.text as string)
            .join("");
          if (fullText.length > streamedTextLength) {
            const delta = fullText.slice(streamedTextLength);
            streamedTextLength = fullText.length;
            yield { type: "chunk", content: delta, done: false } as Chunk;
          }
        }
        assistantHandled = true;
        continue;
      }

      // Result event — fallback if no assistant message was received.
      if (msgType === "result" && !assistantHandled) {
        const result = msgObj.result;
        if (typeof result === "string" && result.length > 0) {
          yield { type: "chunk", content: result, done: false } as Chunk;
        }
      }
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
    for await (const item of this.generateMessages(args)) {
      if ("type" in item && (item as Chunk).type === "chunk") {
        const chunk = item as Chunk;
        if (chunk.content) parts.push(chunk.content);
      }
    }
    return { role: "assistant", content: parts.join("") };
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
