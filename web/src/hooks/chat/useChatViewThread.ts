import { useCallback, useEffect, useState } from "react";

import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message } from "../../stores/ApiTypes";

const NO_MESSAGES: Message[] = [];

interface UseChatViewThreadResult {
  threadId: string | null;
  messages: Message[];
  runtime: ReturnType<typeof useThreadRuntime>;
  selectThread: (threadId: string) => void;
  sendMessage: (message: Message) => Promise<void>;
  stopGeneration: () => void;
}

/**
 * Keeps one ChatView instance bound to its own selected conversation.
 *
 * The global store still records the last focused thread for shared surfaces,
 * but a later selection in another ChatView does not replace this instance's
 * local selection.
 */
export const useChatViewThread = (): UseChatViewThreadResult => {
  const currentThreadId = useGlobalChatStore((state) => state.currentThreadId);
  const switchThread = useGlobalChatStore((state) => state.switchThread);
  const sendToThread = useGlobalChatStore((state) => state.sendMessage);
  const stopThread = useGlobalChatStore((state) => state.stopGeneration);
  const [threadId, setThreadId] = useState<string | null>(currentThreadId);

  const threadExists = useGlobalChatStore((state) =>
    threadId ? state.threads[threadId] !== undefined : false
  );
  const messages = useGlobalChatStore((state) =>
    threadId ? (state.messageCache[threadId] ?? NO_MESSAGES) : NO_MESSAGES
  );
  const runtime = useThreadRuntime(threadId);

  useEffect(() => {
    if ((!threadId || !threadExists) && currentThreadId) {
      setThreadId(currentThreadId);
    }
  }, [currentThreadId, threadExists, threadId]);

  const selectThread = useCallback(
    (nextThreadId: string) => {
      switchThread(nextThreadId);
      setThreadId(nextThreadId);
    },
    [switchThread]
  );

  const sendMessage = useCallback(
    (message: Message) => sendToThread(message, threadId ?? undefined),
    [sendToThread, threadId]
  );

  const stopGeneration = useCallback(() => {
    stopThread(threadId ?? undefined);
  }, [stopThread, threadId]);

  return {
    threadId,
    messages,
    runtime,
    selectThread,
    sendMessage,
    stopGeneration
  };
};
