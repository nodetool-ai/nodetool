/**
 * Core chat processing loop with streaming and tool calling.
 *
 * Port of src/nodetool/chat/regular_chat.py (process_regular_chat).
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { Message, ToolCall, ProviderStreamItem } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import type { Tool } from "@nodetool-ai/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatCallbacks {
  /** Called for each text chunk streamed from the provider. */
  onChunk?: (text: string) => void;
  /** Called when a tool call is received from the provider. */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Called after a tool has been executed. */
  onToolResult?: (toolCall: ToolCall, result: unknown) => void;
}

// ---------------------------------------------------------------------------
// Tool runner
// ---------------------------------------------------------------------------

/**
 * Find and execute a tool by name, returning the ToolCall updated with the result.
 */
export async function runTool(
  context: ProcessingContext,
  toolCall: ToolCall,
  tools: Tool[]
): Promise<ToolCall> {
  const tool = tools.find((t) => t.name === toolCall.name);
  if (!tool) {
    throw new Error(`Tool "${toolCall.name}" not found`);
  }

  const result = await tool.process(context, toolCall.args);

  return {
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args,
    result
  } as ToolCall & { result: unknown };
}

// ---------------------------------------------------------------------------
// Chat processing loop
// ---------------------------------------------------------------------------

function isChunk(item: ProviderStreamItem): item is Chunk {
  return "type" in item && (item as Chunk).type === "chunk";
}

function isToolCall(item: ProviderStreamItem): item is ToolCall {
  return "name" in item && "id" in item && !("type" in item);
}

/**
 * Serializer that handles objects with a `toJSON` method or falls back to
 * stringification, similar to the Python `default_serializer`.
 */
export function defaultSerializer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && "toJSON" in value) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}

/**
 * Process a user message through the provider with streaming and tool calling.
 *
 * Implements the core loop from `process_regular_chat`:
 * 1. Append user message.
 * 2. Stream provider response, accumulating text chunks into an assistant message.
 * 3. When tool calls are received, execute each tool and append assistant + tool messages.
 * 4. If tool calls were processed, re-send the new messages to get the next response.
 * 5. When no more tool calls are pending, return the full message history.
 */
export async function processChat(opts: {
  userInput: string;
  messages: Message[];
  model: string;
  provider: BaseProvider;
  context: ProcessingContext;
  tools?: Tool[];
  callbacks?: ChatCallbacks;
  threadId?: string;
  signal?: AbortSignal;
  /**
   * Cap on tool-calling rounds before we stop and let the user intervene.
   * Each round = one provider stream + parallel execution of any tool calls
   * it produced. Prevents runaway loops when the model repeatedly emits
   * invalid tool calls and gets the same error back. Defaults to 25.
   */
  maxIterations?: number;
}): Promise<Message[]> {
  const {
    userInput,
    messages,
    model,
    provider,
    context,
    tools = [],
    callbacks,
    threadId,
    signal,
    maxIterations = 25
  } = opts;

  // 1. Add user message
  messages.push({ role: "user", content: userInput });

  const providerTools =
    tools.length > 0 ? tools.map((t) => t.toProviderTool()) : undefined;

  let messagesToSend: Message[] = messages;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const toolCallResults: Array<ToolCall & { result: unknown }> = [];
    let assistantText = "";

    const stream = provider.generateMessagesTraced({
      messages: messagesToSend,
      model,
      tools: providerTools,
      threadId,
      onToolCall:
        tools.length > 0
          ? async (name, args) => {
              const toolCall: ToolCall = {
                id: `call_${Date.now()}`,
                name,
                args
              };
              callbacks?.onToolCall?.(toolCall);
              const executed = await runTool(context, toolCall, tools);
              const result = (executed as ToolCall & { result: unknown }).result;
              callbacks?.onToolResult?.(toolCall, result);
              return typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);
            }
          : undefined,
      signal
    });

    // Phase 1: Stream chunks and collect tool calls
    const pendingToolCalls: ToolCall[] = [];

    for await (const item of stream) {
      if (signal?.aborted) break;

      // --- Text chunk ---
      if (isChunk(item)) {
        // Skip thinking chunks — they must not appear in user-visible text output.
        if (item.thinking) continue;

        const text = item.content ?? "";
        callbacks?.onChunk?.(text);
        assistantText += text;

        const last = messages[messages.length - 1];
        if (
          last &&
          last.role === "assistant" &&
          typeof last.content === "string" &&
          !last.toolCalls?.length
        ) {
          last.content += text;
        } else if (
          !last ||
          last.role !== "assistant" ||
          last.toolCalls?.length
        ) {
          messages.push({ role: "assistant", content: text });
        }
      }

      // --- Tool call (collect, don't execute yet) ---
      if (isToolCall(item)) {
        callbacks?.onToolCall?.(item);
        pendingToolCalls.push(item);
      }
    }

    // Phase 2: Execute all collected tool calls in parallel
    if (pendingToolCalls.length > 0) {
      const results = await Promise.all(
        pendingToolCalls.map(async (tc) => {
          const toolResult = await runTool(context, tc, tools);
          callbacks?.onToolResult?.(
            tc,
            (toolResult as ToolCall & { result: unknown }).result
          );
          return toolResult as ToolCall & { result: unknown };
        })
      );
      toolCallResults.push(...results);
    }

    // If tool calls were processed, consolidate into a single assistant message + tool results
    if (toolCallResults.length > 0) {
      // Remove the streaming text-only assistant message (if any) — we'll replace it
      // with a consolidated assistant message that includes both text and tool calls.
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant" && !last.toolCalls?.length) {
        messages.pop();
      }

      // One assistant message with all tool calls (and any accumulated text)
      messages.push({
        role: "assistant",
        content: assistantText || undefined,
        toolCalls: toolCallResults
      });

      // One tool-result message per tool call
      for (const tc of toolCallResults) {
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify(tc.result, defaultSerializer)
        });
      }

      messagesToSend = messages;
    } else {
      break;
    }
  }

  return messages;
}
