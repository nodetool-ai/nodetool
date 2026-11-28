/**
 * Starts the Create view's model on the Settings default for its kind.
 *
 * MediaGenerationStore holds no model until one is picked, so a first visit
 * would stop on a picker even with a default saved. This fills an empty model
 * from `image_model` or `video_model` once the install lists it, and never
 * replaces one the person chose.
 *
 * Editing a picture has no Settings default. It starts on the image default
 * when that model can edit, and otherwise on the first editing model of a
 * connected provider, so connecting a key does not leave the person on a
 * picker with one choice (UX research study 24).
 */
import { useEffect } from "react";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { CreateMode } from "../../stores/CreateViewStore";
import {
  useImageModelsByProvider,
  useVideoModelsByProvider
} from "../../hooks/useModelsByProvider";
import { useModelAvailability } from "../../hooks/useModelAvailability";
import { pickSeedModel } from "../../hooks/useSeedDefaultModels";
import { imageModelPatch, videoModelPatch } from "../chat/composer/modelSelection";

const sameModel = (
  listed: { id: string; provider?: string | null },
  saved: { id: string; provider?: string }
): boolean =>
  listed.id === saved.id &&
  (!saved.provider ||
    (listed.provider ?? "").toLowerCase() === saved.provider.toLowerCase());

export const useCreateModelDefaults = (mode: CreateMode): void => {
  const hasImageModel = useMediaGenerationStore((s) => s.image.model !== null);
  const hasVideoModel = useMediaGenerationStore((s) => s.video.model !== null);
  const hasEditModel = useMediaGenerationStore((s) => s.imageEdit.model !== null);
  const imageDefault = useModelPreferencesStore((s) => s.defaults["image_model"]);
  const videoDefault = useModelPreferencesStore((s) => s.defaults["video_model"]);
  const images = useImageModelsByProvider({ task: "text_to_image" });
  const videos = useVideoModelsByProvider({ task: "text_to_video" });
  const edits = useImageModelsByProvider({ task: "image_to_image" });
  const getAvailability = useModelAvailability();

  useEffect(() => {
    if (mode !== "image" || hasImageModel || images.isLoading || !imageDefault?.id) {
      return;
    }
    const listed = images.models.find((model) => sameModel(model, imageDefault));
    if (listed) {
      const { image, setImageParams } = useMediaGenerationStore.getState();
      setImageParams(imageModelPatch(listed, image));
    }
  }, [mode, hasImageModel, images.isLoading, images.models, imageDefault]);

  useEffect(() => {
    if (mode !== "video" || hasVideoModel || videos.isLoading || !videoDefault?.id) {
      return;
    }
    const listed = videos.models.find((model) => sameModel(model, videoDefault));
    if (listed) {
      const { video, setVideoParams } = useMediaGenerationStore.getState();
      setVideoParams(videoModelPatch(listed, video));
    }
  }, [mode, hasVideoModel, videos.isLoading, videos.models, videoDefault]);

  useEffect(() => {
    if (mode !== "image_edit" || hasEditModel || edits.isLoading) {
      return;
    }
    const isAvailable = (model: (typeof edits.models)[number]): boolean =>
      getAvailability(model).available;
    const fromDefault = imageDefault?.id
      ? edits.models.find(
          (model) => sameModel(model, imageDefault) && isAvailable(model)
        )
      : undefined;
    const pick = fromDefault ?? pickSeedModel(edits.models, isAvailable);
    if (pick) {
      const { imageEdit, setImageEditParams } = useMediaGenerationStore.getState();
      setImageEditParams(imageModelPatch(pick, imageEdit));
    }
  }, [mode, hasEditModel, edits.isLoading, edits.models, imageDefault, getAvailability]);
};
