import { useCallback, useEffect, useState } from "react";

import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message } from "../../stores/ApiTypes";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";

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
  /** The selected thread's history is loading and nothing is cached yet. */
  isLoadingThread: boolean;
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
  const loadMessages = useGlobalChatStore((state) => state.loadMessages);
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
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);

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
      if (isolated) {
        // switchThread loads messages; an isolated view must load its own.
        setLoadingThreadId(nextThreadId);
        void loadMessages(nextThreadId)
          .catch(() => undefined)
          .finally(() => {
            setLoadingThreadId((current) =>
              current === nextThreadId ? null : current
            );
          });
      } else {
        switchThread(nextThreadId);
      }
      setThreadId(nextThreadId);
    },
    [isolated, switchThread, loadMessages]
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
        // Created for this send, so it keeps the mode the send was made in.
        id = await createNewThread(undefined, null, {
          makeCurrent: false,
          mediaMode: useMediaGenerationStore.getState().mode
        });
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
    isLoadingThread:
      threadId !== null && loadingThreadId === threadId && messages.length === 0,
    runtime,
    selectThread,
    createThread,
    sendMessage,
    stopGeneration
  };
};
