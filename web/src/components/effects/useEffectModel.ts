import { useCallback, useMemo, useState } from "react";

import {
  useImageModelsByProvider,
  useVideoModelsByProvider
} from "../../hooks/useModelsByProvider";
import {
  defaultEffectModel,
  type EffectMode,
  type EffectModelRef
} from "./effectsRun";

interface EffectModelState {
  /** The model the effect will run on, or null until one is chosen. */
  model: EffectModelRef | null;
  /** True while the connected providers' models are still loading. */
  loading: boolean;
  /** Choose a model for the current mode. It stays chosen when the mode flips. */
  pick: (model: EffectModelRef) => void;
}

/**
 * The model chip's state. Each mode keeps its own pick, because image-to-video
 * and image editing want different models. A mode with no pick starts on the
 * model the other render surfaces would use.
 */
export const useEffectModel = (mode: EffectMode): EffectModelState => {
  const video = useVideoModelsByProvider({ task: "image_to_video" });
  const image = useImageModelsByProvider({ task: "image_to_image" });
  const [picked, setPicked] = useState<
    Partial<Record<EffectMode, EffectModelRef>>
  >({});

  const available = mode === "image_to_video" ? video.models : image.models;
  const loading =
    mode === "image_to_video" ? video.isLoading : image.isLoading;
  const fallback = useMemo(
    () => defaultEffectModel(mode, available),
    [mode, available]
  );
  const pick = useCallback(
    (model: EffectModelRef) =>
      setPicked((current) => ({ ...current, [mode]: model })),
    [mode]
  );

  return { model: picked[mode] ?? fallback, loading, pick };
};
