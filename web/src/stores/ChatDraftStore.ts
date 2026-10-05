/**
 * ChatDraftStore
 *
 * One-shot prompt seeds for chat threads. A surface that opens a chat tab on
 * the user's behalf — the new-project surface's quick starters, for one —
 * parks the example prompt here; the composer for that thread picks it up on
 * mount and clears it, so the text lands in the box ready to send instead of
 * being sent for the user. Not persisted: a seed that outlives the session
 * would reappear in a conversation the user has moved on from.
 */

import { create } from "zustand";
import type { UiRunReference } from "@nodetool-ai/protocol";

interface ChatDraftStore {
  drafts: Record<string, string>;
  runReferences: Record<string, UiRunReference>;
  setRunReference: (threadId: string, reference: UiRunReference) => void;
  clearRunReference: (threadId: string) => void;
  setDraft: (threadId: string, text: string) => void;
  /** Read a thread's seed and clear it. Returns undefined when there is none. */
  takeDraft: (threadId: string) => string | undefined;
}

export const useChatDraftStore = create<ChatDraftStore>((set, get) => ({
  drafts: {},
  runReferences: {},
  setRunReference: (threadId, reference) => {
    set((state) => ({ runReferences: { ...state.runReferences, [threadId]: reference } }));
  },
  clearRunReference: (threadId) => {
    set((state) => {
      const { [threadId]: _removed, ...rest } = state.runReferences;
      return { runReferences: rest };
    });
  },

  setDraft: (threadId, text) => {
    set((state) => ({ drafts: { ...state.drafts, [threadId]: text } }));
  },

  takeDraft: (threadId) => {
    const draft = get().drafts[threadId];
    if (draft === undefined) {
      return undefined;
    }
    set((state) => {
      const { [threadId]: _taken, ...rest } = state.drafts;
      return { drafts: rest };
    });
    return draft;
  }
}));

export default useChatDraftStore;
