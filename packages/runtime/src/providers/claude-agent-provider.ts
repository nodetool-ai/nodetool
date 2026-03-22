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
   * Convert the provider message array into a prompt + system prompt
   * suitable for the Agent SDK's query() function.
   */
  private buildPromptFromMessages(messages: Message[]): {
    systemPrompt: string;
    prompt: string;
  } {
    let systemPrompt = "You are a helpful assistant.";
    const conversationParts: string[] = [];

    for (const msg of messages) {
      const text = extractText(msg.content);
      if (msg.role === "system") {
        systemPrompt = text;
      } else if (msg.role === "user") {
        conversationParts.push(`User: ${text}`);
      } else if (msg.role === "assistant") {
        conversationParts.push(`Assistant: ${text}`);
      } else if (msg.role === "tool") {
        conversationParts.push(
          `Tool Result (${msg.toolCallId ?? "unknown"}): ${text}`
        );
      }
    }

    // Use the last user message as the prompt; include earlier messages as context.
    let prompt: string;
    if (conversationParts.length > 1) {
      const history = conversationParts.slice(0, -1).join("\n\n");
      systemPrompt += `\n\nPrevious conversation:\n${history}`;
      const lastPart = conversationParts[conversationParts.length - 1];
      // Strip the "User: " prefix if present
      prompt = lastPart.startsWith("User: ")
        ? lastPart.slice(6)
        : lastPart;
    } else if (conversationParts.length === 1) {
      const lastPart = conversationParts[0];
      prompt = lastPart.startsWith("User: ")
        ? lastPart.slice(6)
        : lastPart;
    } else {
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
  }): AsyncGenerator<ProviderStreamItem> {
    const queryFn = await this.getQueryFn();
    const { systemPrompt, prompt } = this.buildPromptFromMessages(
      args.messages
    );

    log.debug("Claude Agent request", {
      model: args.model,
      promptLength: prompt.length,
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
      },
    });

    // Track streamed text length to compute deltas from cumulative stream events.
    let streamedTextLength = 0;
    let assistantHandled = false;

    for await (const msg of queryHandle) {
      const msgObj = msg as Record<string, unknown>;
      const msgType = msgObj.type as string;

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

      // Full assistant message — only emit if we didn't get stream events.
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
