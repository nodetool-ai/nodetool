/**
 * Starts the Create view's model on the Settings default for its kind.
 *
 * MediaGenerationStore holds no model until one is picked, so a first visit
 * would stop on a picker even with a default saved. This fills an empty model
 * from `image_model` or `video_model` once the install lists it, and never
 * replaces one the person chose.
 */
import { useEffect } from "react";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { CreateMode } from "../../stores/CreateViewStore";
import {
  useImageModelsByProvider,
  useVideoModelsByProvider
} from "../../hooks/useModelsByProvider";
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
  const imageDefault = useModelPreferencesStore((s) => s.defaults["image_model"]);
  const videoDefault = useModelPreferencesStore((s) => s.defaults["video_model"]);
  const images = useImageModelsByProvider({ task: "text_to_image" });
  const videos = useVideoModelsByProvider({ task: "text_to_video" });

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
};
