/**
 * useDefaultStillModel
 *
 * The image-model twin of {@link useDefaultDirectorModel}: it pre-fills the
 * Look step's still picker from the saved `image_model` default, so the step
 * can price the render and name the model that will draw it.
 *
 * It does not fall back to "whatever the catalog lists first". A still model
 * decides what the whole board looks like and what it costs, and picking one
 * for the creator by catalog order is a worse answer than asking. When there
 * is no saved default the step blocks with "Pick a still model" instead.
 * Studio stamps its curated model (`useStudioModelPolicy`) before this runs.
 */

import { useEffect } from "react";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import { useImageModelsByProvider } from "../useModelsByProvider";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import type { Provider } from "@nodetool-ai/protocol";
import type { ImageModelValue } from "../../stores/ApiTypes";

export const useDefaultStillModel = (boardId: string): void => {
  const hasModel = useStoryboardStore((state) =>
    state.boards[boardId] ? Boolean(state.boards[boardId].imageModel) : null
  );
  const imageDefault = useModelPreferencesStore(
    (s) => s.defaults["image_model"]
  );
  const { models, isLoading } = useImageModelsByProvider();

  useEffect(() => {
    if (hasModel !== false || isLoading || !imageDefault?.id) {
      return;
    }
    // A saved default the install no longer serves is not a default.
    const listed = models.find(
      (m) =>
        m.id === imageDefault.id &&
        (!imageDefault.provider ||
          (m.provider ?? "").toLowerCase() ===
            imageDefault.provider.toLowerCase())
    );
    if (!listed) {
      return;
    }
    const model: ImageModelValue = {
      type: "image_model",
      id: listed.id,
      provider: (listed.provider ?? "") as Provider,
      name: listed.name ?? listed.id,
      path: ""
    };
    useStoryboardStore.getState().setImageModel(boardId, model);
  }, [boardId, hasModel, isLoading, imageDefault, models]);
};
