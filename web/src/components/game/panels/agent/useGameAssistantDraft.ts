import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand";

import { useChatDraftStore } from "../../../../stores/ChatDraftStore";
import type { GamePanelLayoutState } from "../../../../stores/game/GamePanelLayoutStore";

export interface GameAssistantDraft {
  /** Pass to `GameAgentPanel`, which reports the assistant thread once it exists. */
  readonly onThreadId: (threadId: string | null) => void;
  /** Writes a prompt into the assistant's input without sending it and reveals the assistant panel. */
  readonly draft: (prompt: string) => void;
}

export function useGameAssistantDraft(layoutStore: StoreApi<GamePanelLayoutState>): GameAssistantDraft {
  const [threadId, setThreadId] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !pending.current) { return; }
    useChatDraftStore.getState().setDraft(threadId, pending.current);
    pending.current = null;
  }, [threadId]);
  const draft = useCallback((prompt: string): void => {
    if (threadId) { useChatDraftStore.getState().setDraft(threadId, prompt); }
    else { pending.current = prompt; }
    layoutStore.getState().dispatch({ type: "reveal", panelId: "assistant" });
  }, [layoutStore, threadId]);
  return { onThreadId: setThreadId, draft };
}
