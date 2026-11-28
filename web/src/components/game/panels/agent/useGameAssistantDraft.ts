import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand";

import { useChatDraftStore } from "../../../../stores/ChatDraftStore";
import type { GamePanelLayoutState } from "../../../../stores/game/GamePanelLayoutStore";
import { usePendingGameKickoff } from "../../../../stores/game/GameAssistantKickoffStore";

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

/**
 * Opens the assistant panel while the game is owed its first turn, so the
 * creator lands on the assistant finishing the game instead of a bare editor.
 */
export function useRevealAssistantForKickoff(gameId: string, layoutStore: StoreApi<GamePanelLayoutState>): void {
  const pending = usePendingGameKickoff(gameId) !== null;
  useEffect(() => {
    if (pending) { layoutStore.getState().dispatch({ type: "reveal", panelId: "assistant" }); }
  }, [layoutStore, pending]);
}
