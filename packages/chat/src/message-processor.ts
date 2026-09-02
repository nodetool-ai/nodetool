/**
 * Core chat processing loop with streaming and tool calling.
 *
 * Port of src/nodetool/chat/regular_chat.py (process_regular_chat).
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type {
  Message,
  MessageContent,
  ToolCall,
  ProviderSession,
  RunBudget,
  TurnBudget
} from "@nodetool-ai/runtime";
import {
  ACTIVE_MODEL_CONTEXT_KEY,
  isChunk,
  isProviderSessionUpdate,
  isProviderMessageEvent,
  isToolCall,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Tool,
  extractInjectableImages,
  stripImagePayload,
  truncateToolResult
} from "@nodetool-ai/agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A tool call together with what running it produced. The provider-facing
 * `ToolCall` describes a call the model asked for and has no room for an
 * answer, so the executed form is its own type rather than an intersection
 * asserted onto the call at each use.
 */
export interface ExecutedToolCall extends ToolCall {
  result: unknown;
}

export interface ChatCallbacks {
  /** Called for each text chunk streamed from the provider. */
  onChunk?: (text: string) => void;
  /** Called when a tool call is received from the provider. */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Called after a tool has been executed, with that call's result. */
  onToolResult?: (toolCall: ToolCall, result: ExecutedToolCall["result"]) => void;
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
): Promise<ExecutedToolCall> {
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
  };
}

// ---------------------------------------------------------------------------
// Chat processing loop
// ---------------------------------------------------------------------------

/** A tool result that is already plain text, so it needs no JSON encoding. */
function isTextResult(result: ExecutedToolCall["result"]): result is string {
  return typeof result === "string";
}

/**
 * Serializer that handles objects with a `toJSON` method or falls back to
 * stringification, similar to the Python `default_serializer`.
 */
/** A value `JSON.stringify` can emit directly. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Whether a value implements the `JSON.stringify` hook. By that protocol's
 * contract `toJSON` returns something JSON-representable, which is what lets
 * the serializer hand the result straight back.
 */
function hasToJson<T>(value: T): value is T & { toJSON: () => JsonValue } {
  return value !== null && typeof value === "object" && "toJSON" in value;
}

export function defaultSerializer<T>(_key: string, value: T): T | JsonValue {
  return hasToJson(value) ? value.toJSON() : value;
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
   * The run's spend/deadline/turn admission, consulted before every model
   * turn. Passed straight to `generateLoop`, which refuses a turn that would
   * cross a ceiling instead of making the call. Absent means unbudgeted.
   */
  turnBudget?: TurnBudget | RunBudget;
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
    turnBudget
  } = opts;

  // Stamp the turn's own selection so a tool that launches another harness
  // inherits this chat's provider/model when the call doesn't name one.
  context.set(ACTIVE_MODEL_CONTEXT_KEY, {
    provider: provider.provider,
    model
  } satisfies ActiveModelSelection);

  // 1. Add user message
  messages.push({ role: "user", content: userInput });

  const providerTools =
    tools.length > 0 ? tools.map((t) => t.toProviderTool()) : undefined;

  // Run one tool call and return the result text to feed back to the model.
  // Owns tool resolution + the onToolResult callback; the provider's loop
  // orchestrates the rounds and assembles the messages.
  const executeTool = async (
    toolCall: ToolCall
  ): Promise<string | MessageContent[]> => {
    const executed = await runTool(context, toolCall, tools);
    callbacks?.onToolResult?.(toolCall, executed.result);

    // A view-image-style result carries pixels the model asked for. Forward
    // them as image content beside a light textual note; the base64 never
    // enters the tool-result text.
    const injected = extractInjectableImages(executed.result);
    const value = injected
      ? stripImagePayload(executed.result)
      : executed.result;
    const text = truncateToolResult(
      isTextResult(value)
        ? value
        : (JSON.stringify(value, defaultSerializer) ?? "")
    );
    return injected ? [{ type: "text", text }, ...injected.images] : text;
  };

  // The provider owns the agent loop now. It runs on its own copy of the
  // messages, so we collect the finalized assistant/tool messages it emits
  // into `messages`
  // — keeping the memory prefix out of the returned, persisted history.
  for await (const item of provider.generateLoop({
    messages: messages,
    model,
    tools: providerTools,
    threadId,
    providerSession,
    executeTool: tools.length > 0 ? executeTool : undefined,
    maxIterations,
    turnBudget,
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
      // `isChunk` already excludes raw audio samples; the check narrows
      // `content` to the string `onChunk` takes.
      if (item.content instanceof Float32Array) continue;
      callbacks?.onChunk?.(item.content);
    }
  }

  // Mine the completed turn for new long-term memories.
  //
  return messages;
}
