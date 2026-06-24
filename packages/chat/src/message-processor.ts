/**
 * Core chat processing loop with streaming and tool calling.
 *
 * Port of src/nodetool/chat/regular_chat.py (process_regular_chat).
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message,
  ToolCall,
  ProviderStreamItem,
  ProviderSession
} from "@nodetool-ai/runtime";
import {
  isProviderSessionUpdate,
  isProviderMessageEvent
} from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import { Tool, truncateToolResult } from "@nodetool-ai/agents";
// Pull `formatMemoryForPrompt` from the narrow `./memory` subpath so chat
// consumers don't end up loading the full agents bundle (planners, graph
// builder, sandbox, every tool class) just to render a memory block.
// `LongTermMemory` is a type-only import and has no runtime cost.
import {
  formatMemoryForPrompt,
  type LongTermMemory
} from "@nodetool-ai/agents/memory";

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
  /**
   * Called when the provider emits a session-continuity update. The caller
   * persists the token onto the assistant message so the next turn can resume.
   */
  onProviderSession?: (session: ProviderSession) => void;
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

  const result = await tool.process(context, Tool.stripMessage(toolCall.args));

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
  /**
   * Opaque continuation token from a prior turn (read off the last assistant
   * message). Threaded straight through to the provider, which resumes from it
   * and sends only the new turn; stateless providers ignore it.
   */
  providerSession?: ProviderSession | null;
  signal?: AbortSignal;
  /**
   * Cap on tool-calling rounds before we stop and let the user intervene.
   * Each round = one provider stream + parallel execution of any tool calls
   * it produced. Prevents runaway loops when the model repeatedly emits
   * invalid tool calls and gets the same error back. Defaults to 25.
   */
  maxIterations?: number;
  /**
   * Optional long-term memory. When provided, relevant memories are recalled
   * for `userInput` and injected as a system message into the provider call
   * (without mutating `messages`, so they don't leak into persisted history).
   * After the turn finishes, the conversation is mined for new memories on a
   * best-effort basis — failures don't surface to the caller.
   */
  longTermMemory?: LongTermMemory | null;
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
    providerSession,
    signal,
    maxIterations = 25,
    longTermMemory
  } = opts;

  // Recall memory before pushing the user message — keep the recall fresh
  // (relevant to the new query) and avoid leaking the system block into the
  // persisted `messages` array. The recall result is held as a separate
  // `memoryPrefix` that gets spliced into `messagesToSend` each iteration.
  let memoryPrefix: Message[] = [];
  if (longTermMemory && longTermMemory.isReady()) {
    try {
      const recalled = await longTermMemory.recall(userInput);
      const block = formatMemoryForPrompt(recalled);
      if (block) {
        memoryPrefix = [{ role: "system", content: block }];
      }
    } catch {
      // Memory recall is best-effort. A vector backend hiccup must not
      // break the chat turn.
    }
  }

  // 1. Add user message
  messages.push({ role: "user", content: userInput });

  const providerTools =
    tools.length > 0 ? tools.map((t) => t.toProviderTool()) : undefined;

  // Splice the memory block in right after any existing leading system
  // messages so the persona/system contract still comes first.
  const buildMessagesToSend = (): Message[] => {
    if (memoryPrefix.length === 0) return messages;
    let i = 0;
    while (i < messages.length && messages[i].role === "system") i++;
    return [...messages.slice(0, i), ...memoryPrefix, ...messages.slice(i)];
  };

  const messagesToSend: Message[] = buildMessagesToSend();

  // Run one tool call and return the result text to feed back to the model.
  // Owns tool resolution + the onToolResult callback; the provider's loop
  // orchestrates the rounds and assembles the messages.
  const executeTool = async (toolCall: ToolCall): Promise<string> => {
    const executed = (await runTool(context, toolCall, tools)) as ToolCall & {
      result: unknown;
    };
    callbacks?.onToolResult?.(toolCall, executed.result);
    return truncateToolResult(
      JSON.stringify(executed.result, defaultSerializer) ?? ""
    );
  };

  // The provider owns the agent loop now. `messagesToSend` (which may carry the
  // ephemeral memory prefix) is the loop's input; it runs on its own copy, so
  // we collect the finalized assistant/tool messages it emits into `messages`
  // — keeping the memory prefix out of the returned, persisted history.
  for await (const item of provider.generateLoop({
    messages: messagesToSend,
    model,
    tools: providerTools,
    threadId,
    providerSession,
    executeTool: tools.length > 0 ? executeTool : undefined,
    maxIterations,
    signal
  })) {
    if (signal?.aborted) break;
    if (isProviderSessionUpdate(item)) {
      callbacks?.onProviderSession?.(item.session);
      continue;
    }
    if (isProviderMessageEvent(item)) {
      const m = item.message;
      // Drop a contentless, tool-less assistant turn (e.g. thinking-only).
      if (m.role === "assistant" && !m.content && !m.toolCalls?.length) continue;
      messages.push(m);
      continue;
    }
    if (isToolCall(item)) {
      callbacks?.onToolCall?.(item);
      continue;
    }
    if (isChunk(item)) {
      if (item.thinking) continue;
      if (typeof item.content !== "string") continue;
      callbacks?.onChunk?.(item.content);
    }
  }

  // Mine the completed turn for new long-term memories.
  //
  // The shallow copy here only protects against the array itself being
  // mutated (push / splice / reassignment) after we return — it does NOT
  // deep-clone the message objects, so a caller that later mutates an
  // existing message's `content` in place could in principle still race
  // with extraction. In practice nothing in this repo mutates persisted
  // message content post-hoc, so a deep clone would be wasted allocation
  // on every turn; we accept the trade-off.
  if (longTermMemory && longTermMemory.isReady()) {
    const snapshot = messages.slice();
    void longTermMemory
      .rememberConversation(snapshot, {
        source: threadId ? `chat:${threadId}` : "chat"
      })
      .catch(() => {
        // Already logged inside rememberConversation.
      });
  }

  return messages;
}
