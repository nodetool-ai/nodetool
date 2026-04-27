import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { Message, LanguageModel } from "../stores/ApiTypes";
import { truncateString } from "../utils/truncateString";

/**
 * Chat service hook that provides a unified interface for chat operations.
 * Combines GlobalChatStore state and actions for easy consumption by components.
 * 
 * This hook handles the complexity of:
 * - Thread management (creation, switching, deletion)
 * - Message sending with model selection
 * - Navigation to chat routes
 * - Thread preview generation
 * 
 * @param selectedModel - The currently selected language model for chat responses
 * @returns Object containing chat state and handler functions
 * 
 * @example
 * ```typescript
 * const { 
 *   status, 
 *   sendMessage, 
 *   onNewThread, 
 *   onSelectThread,
 *   threads,
 *   currentThreadId 
 * } = useChatService(selectedModel);
 * 
 * // Send a message
 * await sendMessage({ role: 'user', content: 'Hello!' });
 * 
 * // Create new thread
 * await onNewThread();
 * ```
 */
export const useChatService = (selectedModel: LanguageModel | null) => {
  const navigate = useNavigate();
  const status = useGlobalChatStore((state) => state.status);
  const sendMessage = useGlobalChatStore((state) => state.sendMessage);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const switchThread = useGlobalChatStore((state) => state.switchThread);
  const threads = useGlobalChatStore((state) => state.threads);
  const messageCache = useGlobalChatStore((state) => state.messageCache);
  const currentThreadId = useGlobalChatStore((state) => state.currentThreadId);
  const deleteThread = useGlobalChatStore((state) => state.deleteThread);
  const progress = useGlobalChatStore((state) => state.progress);
  const statusMessage = useGlobalChatStore((state) => state.statusMessage);
  const stopGeneration = useGlobalChatStore((state) => state.stopGeneration);
  const currentPlanningUpdate = useGlobalChatStore((state) => state.currentPlanningUpdate);
  const currentTaskUpdate = useGlobalChatStore((state) => state.currentTaskUpdate);
  const lastTaskUpdatesByThread = useGlobalChatStore((state) => state.lastTaskUpdatesByThread);
  const currentLogUpdate = useGlobalChatStore((state) => state.currentLogUpdate);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        useGlobalChatStore.setState({ error: "No model selected" });
        return;
      }

      const messageWithModel = {
        ...message,
        model: selectedModel.id
      };

      // Use existing thread if available, otherwise create new one
      let threadId = currentThreadId;
      if (!threadId || !threads[threadId]) {
        threadId = await createNewThread();
        switchThread(threadId);
      }

      // sendMessage logs and sets store.error on failure. Swallow the rejection
      // here because most callers (e.g. useMessageQueue.sendMessageNow) invoke
      // this fire-and-forget; the UI already reacts to store.error.
      const targetThreadId = threadId;
      await sendMessage(messageWithModel).then(
        () => {
          setTimeout(() => navigate(`/chat/${targetThreadId}`), 100);
        },
        () => {
          // store.error is already set by sendMessage; nothing more to do.
        }
      );
    },
    [
      selectedModel,
      sendMessage,
      navigate,
      createNewThread,
      switchThread,
      currentThreadId,
      threads
    ]
  );

  const handleThreadSelect = useCallback(
    (threadId: string) => {
      switchThread(threadId);
      navigate(`/chat/${threadId}`);
    },
    [switchThread, navigate]
  );

  const handleNewThread = useCallback(async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
      navigate(`/chat/${newThreadId}`);
    } catch (err) {
      console.error("Failed to create new thread:", err);
    }
  }, [createNewThread, switchThread, navigate]);

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
    deleteThread,
    progress,
    statusMessage,
    stopGeneration,
    currentPlanningUpdate,
    currentTaskUpdate,
    lastTaskUpdatesByThread,
    currentLogUpdate
  };
};
