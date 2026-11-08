import useGlobalChatStore from "../../stores/GlobalChatStore";
import { LOOSE_PROJECT_ID, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";

export async function openChatThread(threadId: string, signal?: AbortSignal): Promise<void> {
  const thread = useGlobalChatStore.getState().threads[threadId] ??
    await trpcClient.threads.get.query({ id: threadId }, { signal });
  if (signal?.aborted) return;
  useWorkspaceTabsStore.getState().openForegroundTab({
    // A Create session opens as Create, not as an empty chat.
    type: thread.kind === "create" ? "create" : "chat",
    ref: thread.id,
    mode: "view",
    title: thread.title || "Chat",
    projectId: thread.project_id ?? LOOSE_PROJECT_ID
  });
}
