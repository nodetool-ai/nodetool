/**
 * The `tool_call` → `tool_result` round trip.
 *
 * Kept out of `ChatStore` so the chat store stays a state container and this
 * stays testable without a socket. Mirrors web's `executeToolCall`: an unknown
 * name still gets a `tool_result`, because a silent drop leaves the agent
 * waiting on a call that will never come back.
 */

import { MobileToolRegistry } from './registry';

/** Server → client request to run a client-side tool. */
export interface ToolCallMessage {
  type: 'tool_call';
  tool_call_id: string;
  name: string;
  /** Absent for a no-argument tool; `isToolCallMessage` does not require it. */
  args?: Record<string, unknown>;
  thread_id: string;
}

/**
 * The subset of the socket this needs. Shaped to match `WebSocketManager.send`,
 * whose constraint is a tagged object.
 */
interface ToolResultSender {
  send: (message: { type: string; [key: string]: unknown }) => void;
}

export function isToolCallMessage(data: unknown): data is ToolCallMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<ToolCallMessage>;
  return (
    candidate.type === 'tool_call' &&
    typeof candidate.tool_call_id === 'string' &&
    typeof candidate.name === 'string'
  );
}

export async function executeToolCall(
  message: ToolCallMessage,
  sender: ToolResultSender
): Promise<void> {
  const { tool_call_id, name, args, thread_id } = message;

  const reply = (payload: Record<string, unknown>): void => {
    try {
      sender.send({ type: 'tool_result', tool_call_id, thread_id, ...payload });
    } catch (error) {
      console.error('Failed to send tool_result:', error);
    }
  };

  if (!MobileToolRegistry.has(name)) {
    reply({
      ok: false,
      error: `Unsupported tool: ${name}`,
      result: { error: `Unsupported tool: ${name}` },
    });
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await MobileToolRegistry.call(name, args ?? {}, tool_call_id);
    reply({ ok: true, result, elapsed_ms: Date.now() - startedAt });
  } catch (error) {
    // The bridge's "no such document is open, here are the open ids" message
    // travels back verbatim — that is how the agent recovers from a bad id.
    const errorText = error instanceof Error ? error.message : 'Unknown error';
    reply({
      ok: false,
      error: errorText,
      result: { error: errorText },
      elapsed_ms: Date.now() - startedAt,
    });
  }
}
