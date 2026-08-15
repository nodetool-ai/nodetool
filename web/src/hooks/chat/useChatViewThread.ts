import { useCallback, useEffect, useState } from "react";

import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message } from "../../stores/ApiTypes";

const NO_MESSAGES: Message[] = [];

interface UseChatViewThreadOptions {
  /**
   * Keep this surface off the editor's current / workflow-bound thread.
   * Used by side-panel assistants so a send does not steal the canvas
   * composer conversation.
   */
  isolated?: boolean;
}

interface UseChatViewThreadResult {
  threadId: string | null;
  messages: Message[];
  runtime: ReturnType<typeof useThreadRuntime>;
  selectThread: (threadId: string) => void;
  createThread: () => Promise<string>;
  sendMessage: (message: Message) => Promise<void>;
  stopGeneration: () => void;
}

/**
 * Keeps one ChatView instance bound to its own selected conversation.
 *
 * The global store still records the last focused thread for shared surfaces,
 * but a later selection in another ChatView does not replace this instance's
 * local selection. Isolated instances never adopt or switch the store's
 * current thread.
 */
export const useChatViewThread = (
  options: UseChatViewThreadOptions = {}
): UseChatViewThreadResult => {
  const isolated = options.isolated === true;
  const currentThreadId = useGlobalChatStore((state) => state.currentThreadId);
  const switchThread = useGlobalChatStore((state) => state.switchThread);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const sendToThread = useGlobalChatStore((state) => state.sendMessage);
  const stopThread = useGlobalChatStore((state) => state.stopGeneration);
  const [threadId, setThreadId] = useState<string | null>(
    isolated ? null : currentThreadId
  );

  const threadExists = useGlobalChatStore((state) =>
    threadId ? state.threads[threadId] !== undefined : false
  );
  const messages = useGlobalChatStore((state) =>
    threadId ? (state.messageCache[threadId] ?? NO_MESSAGES) : NO_MESSAGES
  );
  const runtime = useThreadRuntime(threadId);

  useEffect(() => {
    if (isolated) {
      return;
    }
    if ((!threadId || !threadExists) && currentThreadId) {
      setThreadId(currentThreadId);
    }
  }, [isolated, currentThreadId, threadExists, threadId]);

  const selectThread = useCallback(
    (nextThreadId: string) => {
      if (!isolated) {
        switchThread(nextThreadId);
      }
      setThreadId(nextThreadId);
    },
    [isolated, switchThread]
  );

  const createThread = useCallback(async () => {
    const id = isolated
      ? await createNewThread(undefined, null, { makeCurrent: false })
      : await createNewThread();
    selectThread(id);
    return id;
  }, [isolated, createNewThread, selectThread]);

  const sendMessage = useCallback(
    async (message: Message) => {
      let id = threadId;
      if (!id && isolated) {
        id = await createNewThread(undefined, null, { makeCurrent: false });
        setThreadId(id);
      }
      return sendToThread(message, id ?? undefined);
    },
    [sendToThread, threadId, isolated, createNewThread]
  );

  const stopGeneration = useCallback(() => {
    stopThread(threadId ?? undefined);
  }, [stopThread, threadId]);

  return {
    threadId,
    messages,
    runtime,
    selectThread,
    createThread,
    sendMessage,
    stopGeneration
  };
};
