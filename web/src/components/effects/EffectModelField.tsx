import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { FormField } from "../ui_primitives";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import { modelFieldSx } from "../storyboard/shotRenderModels";
import type { ImageModelValue, VideoModelValue } from "../../stores/ApiTypes";
import type { EffectMode, EffectModelRef } from "./effectsRun";

interface EffectModelFieldProps {
  mode: EffectMode;
  model: EffectModelRef | null;
  onPick: (model: EffectModelRef) => void;
  helperText?: string;
}

/**
 * The model chip. It names the kind of model in its caption (UX Guidelines
 * 2.6) and shows the current one the way every other picker does.
 */
const EffectModelField = ({
  mode,
  model,
  onPick,
  helperText
}: EffectModelFieldProps) => {
  const { t } = useTranslation();
  const handleVideo = useCallback(
    (value: VideoModelValue) => onPick({ id: value.id, provider: value.provider }),
    [onPick]
  );
  const handleImage = useCallback(
    (value: ImageModelValue) => onPick({ id: value.id, provider: value.provider }),
    [onPick]
  );
  const video = mode === "image_to_video";
  return (
    <FormField
      label={t(
        video ? "effectsGallery.model.video" : "effectsGallery.model.image"
      )}
      helperText={helperText}
      sx={modelFieldSx}
    >
      {video ? (
        <VideoModelSelect
          value={model?.id ?? ""}
          provider={model?.provider}
          task="image_to_video"
          onChange={handleVideo}
        />
      ) : (
        <ImageModelSelect
          value={model?.id ?? ""}
          provider={model?.provider}
          task="image_to_image"
          onChange={handleImage}
        />
      )}
    </FormField>
  );
};

export default memo(EffectModelField);
