import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message } from "../../stores/ApiTypes";

export function usePortalChat() {
  const {
    status,
    threads,
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    messageCache
  } = useGlobalChatStore(useShallow((s) => ({
    status: s.status,
    threads: s.threads,
    currentThreadId: s.currentThreadId,
    progress: s.progress,
    statusMessage: s.statusMessage,
    selectedModel: s.selectedModel,
    currentPlanningUpdate: s.currentPlanningUpdate,
    currentTaskUpdate: s.currentTaskUpdate,
    currentLogUpdate: s.currentLogUpdate,
    messageCache: s.messageCache
  })));

  const sendMessage = useCallback(async (message: Message) => {
    const store = useGlobalChatStore.getState();
    let threadId = store.currentThreadId;
    if (!threadId) {
      threadId = await store.createNewThread();
      if (threadId) {
        store.switchThread(threadId);
      }
    }
    if (threadId) {
      await store.sendMessage(message);
    }
  }, []);

  const newThread = useCallback(async () => {
    const store = useGlobalChatStore.getState();
    const threadId = await store.createNewThread();
    if (threadId) {
      store.switchThread(threadId);
    }
    return threadId;
  }, []);

  const selectThread = useCallback((threadId: string) => {
    const store = useGlobalChatStore.getState();
    store.switchThread(threadId);
    store.loadMessages(threadId);
  }, []);

  const deleteThread = useCallback(async (threadId: string) => {
    await useGlobalChatStore.getState().deleteThread(threadId);
  }, []);

  const stopGeneration = useCallback(() => {
    useGlobalChatStore.getState().stopGeneration();
  }, []);

  const setSelectedModel = useCallback((model: LanguageModel) => {
    useGlobalChatStore.setState({ selectedModel: model });
  }, []);

  const messages = currentThreadId ? (messageCache[currentThreadId] ?? []) : [];

  return {
    status,
    threads,
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    messages,
    sendMessage,
    newThread,
    selectThread,
    deleteThread,
    stopGeneration,
    setSelectedModel,
  };
}
