/**
 * What a chat app's thread pieces (step cards, event chips, the steps bar)
 * share: the document split into steps, the app run id the agent's tools
 * address, and the one way a press reaches the agent.
 */
import { createContext, useContext } from "react";
import type {
  ApplicationDocument,
  ChatAppEvent,
  ChatAppLayout
} from "@nodetool-ai/app-runtime";

export interface ChatAppContextValue {
  appRunId: string;
  document: ApplicationDocument;
  layout: ChatAppLayout;
  threadId: string | null;
  /** Send a press to the agent as an `[app event]` user turn. */
  sendEvent: (event: ChatAppEvent) => void;
}

export const ChatAppContext = createContext<ChatAppContextValue | null>(null);

/** Null outside a chat app, e.g. when its thread is opened in plain chat. */
export const useChatApp = (): ChatAppContextValue | null =>
  useContext(ChatAppContext);
