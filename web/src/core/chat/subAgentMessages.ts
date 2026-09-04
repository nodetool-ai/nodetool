/**
 * Sub-agent transcripts, kept out of the main thread.
 *
 * A `run_subtask` / `run_search` child streams its own chunks, tool calls and
 * tool results back over the same socket, each tagged with the
 * `parent_tool_call_id` of the call that spawned it. Appending those to the
 * thread's message cache interleaves a child's prose with the parent's reply.
 * They are bucketed here instead — one transcript per spawning call — and the
 * chat renders each bucket inside that call's card.
 */

import type { Message } from "../../stores/ApiTypes";
import { isString } from "../../utils/typePredicates";

/** threadId → spawning tool_call_id → the child's messages, in arrival order. */
export type SubAgentMessages = Record<string, Record<string, Message[]>>;

interface SubAgentTagged {
  parent_tool_call_id?: string | null;
}

/** The spawning call's id when this payload came from a sub-agent, else null. */
export function subAgentCallId(payload: SubAgentTagged): string | null {
  const id = payload.parent_tool_call_id;
  return isString(id) && id.length > 0 ? id : null;
}

/** Shared empty result so selectors keep a stable reference. */
const EMPTY_TRANSCRIPT: Message[] = [];

/** The transcript for one spawning call. Empty array when there is none. */
export function subAgentTranscript(
  map: SubAgentMessages | undefined,
  threadId: string | null | undefined,
  callId: string | null | undefined
): Message[] {
  if (!map || !threadId || !callId) {
    return EMPTY_TRANSCRIPT;
  }
  return map[threadId]?.[callId] ?? EMPTY_TRANSCRIPT;
}

function withTranscript(
  map: SubAgentMessages,
  threadId: string,
  callId: string,
  messages: Message[]
): SubAgentMessages {
  return {
    ...map,
    [threadId]: { ...(map[threadId] ?? {}), [callId]: messages }
  };
}

const textOf = (message: Message): string =>
  isString(message.content) ? message.content : "";

/**
 * Fold streamed text into the transcript's trailing assistant message, or
 * start one. Mirrors what `applyChunk` does for the main thread.
 */
export function appendSubAgentChunk(
  map: SubAgentMessages,
  threadId: string,
  callId: string,
  text: string
): SubAgentMessages {
  if (!text) {
    return map;
  }
  const messages = map[threadId]?.[callId] ?? [];
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant" && !last.tool_calls) {
    const merged: Message = { ...last, content: textOf(last) + text };
    return withTranscript(map, threadId, callId, [
      ...messages.slice(0, -1),
      merged
    ]);
  }
  const started: Message = {
    id: `subagent-stream-${callId}-${messages.length}`,
    role: "assistant",
    type: "message",
    content: text,
    thread_id: threadId,
    parent_tool_call_id: callId
  };
  return withTranscript(map, threadId, callId, [...messages, started]);
}

/**
 * Append a server-authored child message. An assistant message that finalizes
 * text already streamed into the transcript replaces that placeholder instead
 * of doubling it.
 */
export function appendSubAgentMessage(
  map: SubAgentMessages,
  threadId: string,
  callId: string,
  message: Message
): SubAgentMessages {
  const messages = map[threadId]?.[callId] ?? [];
  const last = messages[messages.length - 1];
  const incomingText = textOf(message).trimEnd();
  const lastText = last ? textOf(last).trimEnd() : "";
  const finalizesStream =
    message.role === "assistant" &&
    last?.role === "assistant" &&
    lastText.length > 0 &&
    incomingText.startsWith(lastText);
  if (finalizesStream) {
    const replacement: Message = {
      ...last,
      ...message,
      content: message.content ?? last.content
    };
    return withTranscript(map, threadId, callId, [
      ...messages.slice(0, -1),
      replacement
    ]);
  }
  return withTranscript(map, threadId, callId, [...messages, message]);
}

/** Record a child tool result as the `tool` message the renderer looks up. */
export function appendSubAgentToolResult(
  map: SubAgentMessages,
  threadId: string,
  callId: string,
  result: {
    tool_call_id?: string | null;
    name?: string | null;
    result?: unknown;
  }
): SubAgentMessages {
  const toolCallId = result.tool_call_id;
  if (!isString(toolCallId) || !toolCallId) {
    return map;
  }
  const message: Message = {
    role: "tool",
    type: "message",
    name: result.name ?? null,
    tool_call_id: toolCallId,
    content: result.result as Message["content"],
    thread_id: threadId,
    parent_tool_call_id: callId,
    created_at: new Date().toISOString()
  };
  return appendSubAgentMessage(map, threadId, callId, message);
}
