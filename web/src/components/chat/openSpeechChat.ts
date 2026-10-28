import useChatDraftStore from "../../stores/ChatDraftStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import type { MediaMode } from "../../stores/MediaGenerationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import type { DroppedFile } from "./types/chat.types";

export interface OpenMediaChatOptions {
  title?: string;
  draft?: string;
  attachments?: DroppedFile[];
  mediaMode?: MediaMode;
}

async function openMediaGenerationChat(
  projectId: string,
  defaultMode: MediaMode,
  defaultTitle: string,
  lineOrOptions: string | OpenMediaChatOptions = ""
): Promise<string> {
  const options: OpenMediaChatOptions =
    typeof lineOrOptions === "string"
      ? { draft: lineOrOptions }
      : lineOrOptions;
  const mediaMode = options.mediaMode ?? defaultMode;
  const title = options.title || defaultTitle;
  const draft = options.draft ?? "";

  const threadId = await useGlobalChatStore
    .getState()
    .createNewThread(title, null, { projectId, mediaMode });
  if (draft.length > 0) {
    useChatDraftStore.getState().setDraft(threadId, draft);
  }
  if (options.attachments && options.attachments.length > 0) {
    useChatDraftStore.getState().setAttachments(threadId, options.attachments);
  }
  useWorkspaceTabsStore.getState().openForegroundTab({
    type: "chat",
    ref: threadId,
    mode: "view",
    title,
    projectId
  });
  return threadId;
}

/**
 * Open a new chat with its composer on "Read aloud", holding `line` as its
 * draft, so the next line sent is spoken. People asked the chat to read aloud first and found the speech
 * mode late (study-5-I3).
 */
export async function openSpeechChat(
  projectId: string,
  line = ""
): Promise<void> {
  await openMediaGenerationChat(projectId, "audio", "Read aloud", line);
}

/**
 * Open a dedicated Image generation tab (`mediaMode: "image"` or `"image_edit"`),
 * seeding any prompt or reference attachments into its composer.
 */
export async function openImageChat(
  projectId: string,
  options: string | OpenMediaChatOptions = ""
): Promise<string> {
  return openMediaGenerationChat(projectId, "image", "New image", options);
}

/**
 * Open a dedicated Video generation tab (`mediaMode: "video"` or `"image_to_video"`),
 * seeding any prompt or reference attachments into its composer.
 */
export async function openVideoChat(
  projectId: string,
  options: string | OpenMediaChatOptions = ""
): Promise<string> {
  return openMediaGenerationChat(projectId, "video", "New video", options);
}
