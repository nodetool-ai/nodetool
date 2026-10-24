import { useShallow } from "zustand/react/shallow";

import useGlobalChatStore from "../stores/GlobalChatStore";

/**
 * The canvas chat of one workflow: how many messages its thread holds and
 * whether a reply is streaming. Only the workflow's own thread counts, so a
 * side-panel assistant (code, sketch, …) on its own thread does not.
 */
export const useCanvasConversation = (
  workflowId: string | null | undefined
): { conversationCount: number; chatBusy: boolean } =>
  useGlobalChatStore(
    useShallow((state) => {
      const threadId =
        (workflowId ? state.workflowThreadId[workflowId] : null) ??
        state.currentThreadId;
      const runtime = threadId ? state.threadRuntime[threadId] : undefined;
      return {
        conversationCount: threadId
          ? (state.messageCache[threadId]?.length ?? 0)
          : 0,
        chatBusy:
          runtime?.status === "loading" || runtime?.status === "streaming"
      };
    })
  );
