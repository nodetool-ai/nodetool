/**
 * Structured output over any provider.
 *
 * A model returns a typed object by being forced to call one tool whose input
 * schema *is* the shape wanted. Every provider in the registry supports
 * `toolChoice`, so this is the one mechanism that works across all of them,
 * and it is what the Director node, the agent nodes, and the `generate_text`
 * RPC all call.
 *
 * A model that answers with prose instead of a tool call (a provider with no
 * tool support, the fake e2e provider) falls back to JSON parsed out of that
 * prose. Only a call that produces neither returns null — a provider error
 * still throws.
 */

import type { BaseProvider } from "./base-provider.js";
import type { Message } from "./types.js";

/** Flatten a message's content to the text a JSON fallback can be read from. */
export function messageText(content: Message["content"] | unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: string }).type === "text"
        ? String((part as { text?: unknown }).text ?? "")
        : ""
    )
    .join("")
    .trim();
}

/**
 * Parse a JSON object out of model prose — the whole string first, then the
 * widest `{…}` span in it, which is what survives a fenced block or a
 * sentence wrapped around the answer.
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed: unknown = JSON.parse(text.slice(start, end + 1));
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface StructuredCallArgs {
  messages: Message[];
  model: string;
  maxTokens?: number;
  /** The tool the model is forced into; its name reaches the model. */
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool's input — the shape being asked for. */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

/**
 * Call a provider with a result tool to get structured output. Returns the
 * tool call's arguments, or JSON recovered from the text answer, or null when
 * the model produced neither.
 */
export async function generateStructured(
  provider: BaseProvider,
  args: StructuredCallArgs
): Promise<Record<string, unknown> | null> {
  const call =
    typeof provider.generateMessageTraced === "function"
      ? provider.generateMessageTraced.bind(provider)
      : provider.generateMessage.bind(provider);
  const result = await call({
    messages: args.messages,
    model: args.model,
    maxTokens: args.maxTokens,
    signal: args.signal,
    tools: [
      {
        name: args.toolName,
        description: args.toolDescription,
        inputSchema: args.schema
      }
    ],
    toolChoice: args.toolName
  });
  const toolCall = result.toolCalls?.[0];
  if (toolCall && toolCall.name === args.toolName) {
    return toolCall.args as Record<string, unknown>;
  }
  return extractJson(messageText(result.content));
}
