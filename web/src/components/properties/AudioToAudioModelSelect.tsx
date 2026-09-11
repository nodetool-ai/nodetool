import React, { useMemo } from "react";
import isEqual from "../../utils/isEqual";
import AudioToAudioModelMenuDialog from "../model_menu/AudioToAudioModelMenuDialog";
import type {
  AudioToAudioModel,
  AudioToAudioModelValue,
  ModelPack,
  UnifiedModel
} from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";
import { isString } from "../../utils/typePredicates";

interface AudioToAudioModelSelectProps {
  onChange: (value: AudioToAudioModelValue) => void;
  value: string | AudioToAudioModelValue;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const AudioToAudioModelSelect: React.FC<AudioToAudioModelSelectProps> = ({
  onChange,
  value,
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("audio_to_audio_model", onChange);
  const { data: models } = useQuery({
    queryKey: ["audio-to-audio-models"],
    queryFn: () =>
      trpc.models.audioToAudio.query() as Promise<AudioToAudioModel[]>
  });

  const modelId = useMemo(() => {
    if (isString(value)) {
      return value;
    }
    return value?.id || "";
  }, [value]);

  const modelProvider = useMemo(
    () => (typeof value === "object" ? value?.provider ?? "" : ""),
    [value]
  );

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !modelId) {
      return null;
    }
    const exact = modelProvider
      ? models.find((m) => m.id === modelId && m.provider === modelProvider)
      : null;
    return exact ?? models.find((m) => m.id === modelId) ?? null;
  }, [models, modelId, modelProvider]);

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!modelId}
        label={
          currentSelectedModelDetails?.name ||
          modelId ||
          "Select Audio To Audio Model"
        }
        subLabel="Select Audio-to-Audio Model"
        onClick={handleClick}
      />
      <AudioToAudioModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleSelect}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(AudioToAudioModelSelect, isEqual);
