import useGlobalChatStore from "../stores/GlobalChatStore";

export const useChatSocket = () =>
  useGlobalChatStore((state) => ({
    connect: state.connect,
    disconnect: state.disconnect,
    sendMessage: state.sendMessage,
    stopGeneration: state.stopGeneration,
    status: state.status,
    progress: state.progress,
    statusMessage: state.statusMessage,
    error: state.error,
    currentThreadId: state.currentThreadId,
    getCurrentMessages: state.getCurrentMessages,
    threads: state.threads,
    createNewThread: state.createNewThread,
    switchThread: state.switchThread,
    deleteThread: state.deleteThread,
    updateThreadTitle: state.updateThreadTitle,
    resetMessages: state.resetMessages
  }));
