import { createLogger } from "@nodetool-ai/config";
import type { Message, ProcessingContext } from "@nodetool-ai/runtime";
import { messageContentText, normalizeMessage } from "./agent-utils.js";

const log = createLogger("nodetool.base-nodes.agents");

type ThreadLike = { id: string; title: string; messages: Message[] };

// In-memory thread store used ONLY as a fallback for runs where the context
// has no message-store model interface wired — hermetic CLI runs
// (`node run --no-secrets`) and unit tests. When the store IS wired, agent
// nodes read/write the DB-backed context directly and DB errors propagate; the
// map below is never touched. It is bounded so a long-running provider-less
// process can't leak: at most MAX_THREADS threads (least-recently-used evicted)
// and MAX_MESSAGES_PER_THREAD messages per thread (oldest dropped).
const MAX_THREADS = 100;
const MAX_MESSAGES_PER_THREAD = 1000;

export const THREAD_STORE = new Map<string, ThreadLike>();

/**
 * Get-or-create a fallback thread and mark it most-recently-used (Map keeps
 * insertion order, so delete+set moves it to the end). Evicts the oldest
 * threads once the cap is exceeded.
 */
export function seedFallbackThread(threadId: string, title: string): ThreadLike {
  const existing = THREAD_STORE.get(threadId);
  const thread = existing ?? { id: threadId, title, messages: [] };
  if (existing) THREAD_STORE.delete(threadId);
  THREAD_STORE.set(threadId, thread);
  while (THREAD_STORE.size > MAX_THREADS) {
    const oldest = THREAD_STORE.keys().next().value;
    if (oldest === undefined || oldest === threadId) break;
    THREAD_STORE.delete(oldest);
  }
  return thread;
}

export async function loadThreadMessages(
  context: ProcessingContext | undefined,
  threadId: string
): Promise<Message[]> {
  if (!threadId) return [];

  // DB-backed path: the getMessages interface is wired, so read through the
  // typed context method and let any error propagate (no silent fallback).
  if (context?.hasModelInterface?.("getMessages")) {
    const result = await context.getThreadMessages(threadId, 1000, null, false);
    const messages = (result.messages ?? [])
      .map((item) => normalizeMessage(item))
      .filter(
        (message): message is Message =>
          message !== null && message.role !== "system"
      );
    log.info("Agent thread history loaded from context", {
      threadId,
      messageCount: messages.length
    });
    return messages;
  }

  const fallbackMessages = (THREAD_STORE.get(threadId)?.messages ?? [])
    .filter((message) => message.role !== "system")
    .map((message) => ({ ...message }));
  log.info("Agent thread history loaded from fallback store", {
    threadId,
    messageCount: fallbackMessages.length
  });
  return fallbackMessages;
}

export async function saveThreadMessage(
  context: ProcessingContext | undefined,
  threadId: string,
  message: Message
): Promise<void> {
  if (!threadId) return;

  // DB-backed path: the createMessage interface is wired, so write through the
  // typed context method and let any error propagate (no silent fallback that
  // would disguise data loss as success).
  if (context?.hasModelInterface?.("createMessage")) {
    await context.createMessage({
      thread_id: threadId,
      role: message.role,
      content: message.content ?? null,
      tool_calls: message.toolCalls ?? null,
      tool_call_id: message.toolCallId ?? null
    });
    log.info("Agent thread message saved via context", {
      threadId,
      role: message.role,
      hasToolCalls: (message.toolCalls?.length ?? 0) > 0,
      textLength: messageContentText(message.content).length
    });
    return;
  }

  const thread = seedFallbackThread(threadId, "Agent Conversation");
  thread.messages.push({ ...message, threadId });
  while (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
    thread.messages.shift();
  }
  log.info("Agent thread message saved via fallback store", {
    threadId,
    role: message.role,
    threadSize: thread.messages.length,
    hasToolCalls: (message.toolCalls?.length ?? 0) > 0,
    textLength: messageContentText(message.content).length
  });
}
