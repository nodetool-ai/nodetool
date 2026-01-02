import { useCallback } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { Message, LanguageModel } from "../stores/ApiTypes";

/**
 * Truncate a string to a max length.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

export const useChatService = (selectedModel: LanguageModel | null) => {
  const {
    connect,
    status,
    sendMessage,
    createNewThread,
    switchThread,
    threads,
    messageCache,
    currentThreadId,
    ...rest
  } = useGlobalChatStore();

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        console.error("No model selected");
        return;
      }

      if (status === "failed") {
        console.error("Chat service connection failed");
        return;
      }

      try {
        const messageWithModel = {
          ...message,
          model: selectedModel.id
        };

        if (status !== "connected") {
          await connect();
        }

        // Use existing thread if available, otherwise create new one
        let threadId = currentThreadId;
        if (!threadId) {
          threadId = await createNewThread();
          switchThread(threadId);
        } else {
          // Verify thread exists in store before sending message
          if (!threads[threadId]) {
            console.warn(
              `Current thread ${threadId} not found in store, creating new thread`
            );
            threadId = await createNewThread();
            switchThread(threadId);
          }
        }

        await sendMessage(messageWithModel);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [
      selectedModel,
      sendMessage,
      status,
      connect,
      createNewThread,
      switchThread,
      currentThreadId,
      threads
    ]
  );

  const handleThreadSelect = useCallback(
    (threadId: string) => {
      switchThread(threadId);
    },
    [switchThread]
  );

  const handleNewThread = useCallback(async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  }, [createNewThread, switchThread]);

  const getThreadPreview = useCallback(
    (threadId: string) => {
      const thread = threads[threadId];
      if (!thread) {
        return "No messages yet";
      }

      // Use thread title if available
      if (thread.title) {
        return truncateString(thread.title, 100);
      }

      // Check if we have cached messages for this thread
      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find((m) => m.role === "user");
      const preview = firstUserMessage?.content
        ? typeof firstUserMessage.content === "string"
          ? firstUserMessage.content
          : "Chat started"
        : "Chat started";

      return truncateString(preview, 100);
    },
    [threads, messageCache]
  );

  return {
    status,
    sendMessage: handleSendMessage,
    onNewThread: handleNewThread,
    onSelectThread: handleThreadSelect,
    getThreadPreview,
    threads,
    currentThreadId,
    ...rest
  };
};
