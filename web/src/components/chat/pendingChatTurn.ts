import type { MessageContent } from "../../stores/ApiTypes";

const pendingTurns = new Map<string, MessageContent[]>();

export const stageChatTurn = (threadId: string, content: MessageContent[]): void => {
  pendingTurns.set(threadId, content);
};

export const peekChatTurn = (threadId: string): MessageContent[] | null =>
  pendingTurns.get(threadId) ?? null;

export const clearChatTurn = (threadId: string): void => {
  pendingTurns.delete(threadId);
};
