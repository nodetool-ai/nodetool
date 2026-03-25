// web/src/components/portal/usePortalChat.ts
import { useCallback } from "react";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LanguageModel, Message } from "../../stores/ApiTypes";

export function usePortalChat() {
  const status = useGlobalChatStore((s) => s.status);
  const threads = useGlobalChatStore((s) => s.threads);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const progress = useGlobalChatStore((s) => s.progress);
  const statusMessage = useGlobalChatStore((s) => s.statusMessage);
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const currentPlanningUpdate = useGlobalChatStore((s) => s.currentPlanningUpdate);
  const currentTaskUpdate = useGlobalChatStore((s) => s.currentTaskUpdate);
  const currentLogUpdate = useGlobalChatStore((s) => s.currentLogUpdate);
  const messageCache = useGlobalChatStore((s) => s.messageCache);
  const agentMode = useGlobalChatStore((s) => s.agentMode);
  const selectedTools = useGlobalChatStore((s) => s.selectedTools);

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

  const setAgentMode = useCallback((enabled: boolean) => {
    useGlobalChatStore.setState({ agentMode: enabled });
  }, []);

  const setSelectedTools = useCallback((tools: string[]) => {
    useGlobalChatStore.setState({ selectedTools: tools });
  }, []);

  const messages = currentThreadId ? (messageCache[currentThreadId] ?? []) : [];

  return {
    status,
    threads,
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    selectedTools,
    agentMode,
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
    setAgentMode,
    setSelectedTools,
  };
}
