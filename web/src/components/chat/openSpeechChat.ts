import useChatDraftStore from "../../stores/ChatDraftStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

/**
 * Open a new chat with its composer on "Read aloud", holding `line` as its
 * draft, so the next line sent is spoken. People asked the chat to read aloud first and found the speech
 * mode late (study-5-I3).
 */
export async function openSpeechChat(
  projectId: string,
  line = ""
): Promise<void> {
  useMediaGenerationStore.getState().setMode("audio");
  const threadId = await useGlobalChatStore
    .getState()
    .createNewThread(undefined, null, { projectId });
  if (line.length > 0) {
    useChatDraftStore.getState().setDraft(threadId, line);
  }
  useWorkspaceTabsStore.getState().openForegroundTab({
    type: "chat",
    ref: threadId,
    mode: "view",
    title: "Read aloud",
    projectId
  });
}
