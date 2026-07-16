import { createLogger } from "@nodetool-ai/config";
import type { Message, ProcessingContext } from "@nodetool-ai/runtime";
import { messageContentText, normalizeMessage } from "./agent-utils.js";

const log = createLogger("nodetool.base-nodes.agents");

type ThreadLike = { id: string; title: string; messages: Message[] };

export const THREAD_STORE = new Map<string, ThreadLike>();

function threadMessages(threadId: string): Message[] {
  const thread = THREAD_STORE.get(threadId);
  if (!thread) return [];
  return thread.messages.map((message) => ({ ...message }));
}

function logThreadWarning(
  message: string,
  error: unknown,
  details: Record<string, unknown>
): void {
  if (process.env["NODE_ENV"] === "test") return;
  log.warn(`[AgentNode] ${message}`, {
    ...details,
    error: String(error)
  });
}

export async function loadThreadMessages(
  context: ProcessingContext | undefined,
  threadId: string
): Promise<Message[]> {
  if (!threadId) return [];
  const threadedContext = context as
    | (ProcessingContext & {
        get_messages?: (
          threadId: string,
          limit?: number,
          startKey?: string | null,
          reverse?: boolean
        ) => Promise<{ messages: Array<Record<string, unknown>> }>;
        getThreadMessages?: (
          threadId: string,
          limit?: number,
          startKey?: string | null,
          reverse?: boolean
        ) => Promise<{ messages: Array<Record<string, unknown>> }>;
      })
    | undefined;
  const getMessages =
    threadedContext?.get_messages?.bind(threadedContext) ??
    threadedContext?.getThreadMessages?.bind(threadedContext);
  if (getMessages) {
    try {
      const result = await getMessages(threadId, 1000, null, false);
      const messages = (result.messages ?? [])
        .map((item: Record<string, unknown>) => normalizeMessage(item))
        .filter(
          (message: Message | null): message is Message =>
            message !== null && message.role !== "system"
        );
      log.info("Agent thread history loaded from context", {
        threadId,
        messageCount: messages.length
      });
      return messages;
    } catch (error) {
      logThreadWarning("Failed to load thread messages", error, { threadId });
    }
  }
  const fallbackMessages = threadMessages(threadId).filter(
    (message) => message.role !== "system"
  );
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
  const threadedContext = context as
    | (ProcessingContext & {
        create_message?: (req: Record<string, unknown>) => Promise<unknown>;
        createMessage?: (req: Record<string, unknown>) => Promise<unknown>;
      })
    | undefined;
  const createMessage =
    threadedContext?.create_message?.bind(threadedContext) ??
    threadedContext?.createMessage?.bind(threadedContext);
  if (createMessage) {
    try {
      await createMessage({
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
    } catch (error) {
      logThreadWarning("Failed to save thread message", error, {
        threadId,
        role: message.role
      });
    }
  }

  const thread = THREAD_STORE.get(threadId) ?? {
    id: threadId,
    title: "Agent Conversation",
    messages: []
  };
  thread.messages.push({
    ...message,
    threadId
  });
  THREAD_STORE.set(threadId, thread);
  log.info("Agent thread message saved via fallback store", {
    threadId,
    role: message.role,
    threadSize: thread.messages.length,
    hasToolCalls: (message.toolCalls?.length ?? 0) > 0,
    textLength: messageContentText(message.content).length
  });
}
