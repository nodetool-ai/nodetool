import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LOOSE_PROJECT_ID, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";

export async function openChatThread(threadId: string, signal?: AbortSignal): Promise<void> {
  const thread = useGlobalChatStore.getState().threads[threadId] ??
    await trpcClient.threads.get.query({ id: threadId }, { signal });
  if (signal?.aborted) return;
  useWorkspaceTabsStore.getState().openForegroundTab({
    type: "chat",
    ref: thread.id,
    mode: "view",
    title: thread.title || "Chat",
    projectId: thread.project_id ?? LOOSE_PROJECT_ID
  });
}
