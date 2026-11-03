import type { MessageContent } from "../../stores/ApiTypes";
import type { MediaGenerationRequest } from "./types/media.types";

const pendingTurns = new Map<string, MessageContent[]>();
const pendingMedia = new Map<string, MediaGenerationRequest>();

/**
 * Stage the opening turn of a thread. A media request makes it a generation in
 * that mode instead of a chat message.
 */
export const stageChatTurn = (
  threadId: string,
  content: MessageContent[],
  mediaGeneration?: MediaGenerationRequest | null
): void => {
  pendingTurns.set(threadId, content);
  if (mediaGeneration && mediaGeneration.mode !== "chat") {
    pendingMedia.set(threadId, mediaGeneration);
  } else {
    pendingMedia.delete(threadId);
  }
};

export const peekChatTurn = (threadId: string): MessageContent[] | null =>
  pendingTurns.get(threadId) ?? null;

export const peekChatTurnMedia = (
  threadId: string
): MediaGenerationRequest | null => pendingMedia.get(threadId) ?? null;

export const clearChatTurn = (threadId: string): void => {
  pendingTurns.delete(threadId);
  pendingMedia.delete(threadId);
};
