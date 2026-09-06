/**
 * useDefaultDirectorModel
 *
 * Stamps a director model onto a board that has none, so the guided setup
 * flow can direct a screenplay without a model picker of its own. The flow
 * hides every model choice; without this the first Direct run stops at "Pick a
 * model before directing." with nowhere to pick one.
 *
 * Resolution order matches {@link useCodeAuthoringModel}: the saved
 * `language_model` default, the active chat model, then the first model the
 * catalog returns. A candidate the catalog does not list is skipped — the chat
 * store starts on a hardcoded application default that a given install may not
 * serve, and stamping that would trade one dead end for another. Studio has
 * its own policy (`useStudioModelPolicy`) and does not use this hook.
 */

import { useEffect } from "react";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useLanguageModelsByProvider } from "../useModelsByProvider";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import type { Provider } from "@nodetool-ai/protocol";
import type { LanguageModelValue } from "../../stores/ApiTypes";

export const useDefaultDirectorModel = (boardId: string): void => {
  const hasModel = useStoryboardStore((state) =>
    state.boards[boardId] ? Boolean(state.boards[boardId].directorModel) : null
  );
  const languageDefault = useModelPreferencesStore(
    (s) => s.defaults["language_model"]
  );
  const chatModel = useGlobalChatStore((s) => s.selectedModel);
  const { models, isLoading } = useLanguageModelsByProvider();

  useEffect(() => {
    if (hasModel !== false || isLoading) {
      return;
    }
    const inCatalog = (id: string, provider?: string) =>
      models.find(
        (m) =>
          m.id === id &&
          (!provider || (m.provider ?? "").toLowerCase() === provider.toLowerCase())
      );
    const candidate =
      [languageDefault, chatModel]
        .map((m) => (m?.id ? inCatalog(m.id, m.provider) : undefined))
        .find(Boolean) ?? models[0];
    if (!candidate?.id) {
      return;
    }
    const model: LanguageModelValue = {
      type: "language_model",
      id: candidate.id,
      provider: (candidate.provider ?? "") as Provider,
      name: candidate.name ?? candidate.id
    };
    useStoryboardStore.getState().setDirectorModel(boardId, model);
  }, [boardId, hasModel, isLoading, languageDefault, chatModel, models]);
};
