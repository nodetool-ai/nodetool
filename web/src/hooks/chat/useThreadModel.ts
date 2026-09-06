import { useCallback, useEffect } from "react";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import type { LanguageModel } from "../../stores/ApiTypes";

interface UseThreadModelResult {
  /** The conversation's own model, falling back to the last global pick. */
  model: LanguageModel;
  /** Pick a model for this conversation (and make it the default for new ones). */
  setModel: (model: LanguageModel) => void;
}

/**
 * Bind a chat surface's model picker to one conversation.
 *
 * Several chat tabs and assistant panels are open at once and all read the
 * same store, so a pick used to move every one of them. The selection is
 * per-thread instead: opening a surface pins its conversation to the model it
 * starts on, and a pick here writes only that pin (plus the global default a
 * conversation with no pin of its own starts from).
 */
export const useThreadModel = (
  threadId: string | null
): UseThreadModelResult => {
  const model = useGlobalChatStore((state) =>
    state.getSelectedModel(threadId)
  );
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );
  const pinThreadModel = useGlobalChatStore((state) => state.pinThreadModel);

  // `model` is a dependency so a conversation opened before anything was
  // picked (the first-run placeholder) pins as soon as a real model lands.
  useEffect(() => {
    if (threadId) {
      pinThreadModel(threadId);
    }
  }, [threadId, model, pinThreadModel]);

  const setModel = useCallback(
    (next: LanguageModel) => setSelectedModel(next, threadId),
    [setSelectedModel, threadId]
  );

  return { model, setModel };
};

export default useThreadModel;
