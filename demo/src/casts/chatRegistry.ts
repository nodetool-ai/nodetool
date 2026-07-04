/**
 * Chat cast registry — the set of chat-panel demo recordings Remotion can
 * render. Sibling to `registry.ts` (the graph-editor casts).
 */
import { agentChatCast, type ChatDemoCast } from "@web-demo";

const chatCasts: ChatDemoCast[] = [agentChatCast];

export const getChatCast = (id: string): ChatDemoCast => {
  const cast = chatCasts.find((c) => c.id === id);
  if (!cast) throw new Error(`Unknown chat cast id: ${id}`);
  return cast;
};
