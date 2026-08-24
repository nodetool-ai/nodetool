import React, { useMemo } from "react";
import isEqual from "../../utils/isEqual";
import VideoModelMenuDialog from "../model_menu/VideoModelMenuDialog";
import type {
  ModelPack,
  UnifiedModel,
  VideoModel,
  VideoModelValue
} from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import type { VideoModelTask } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";
import CuratedModelSelect from "./curated/CuratedModelSelect";
import { useInStudio } from "../../studio/StudioContext";
import { forTasks, STUDIO_CLIP_MODELS } from "../../studio/curatedModels";

interface VideoModelSelectProps {
  onChange: (value: VideoModelValue) => void;
  value: string;
  task?: VideoModelTask;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const VideoModelSelect: React.FC<VideoModelSelectProps> = ({
  onChange,
  value,
  task,
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("video_model", onChange);
  const inStudio = useInStudio();

  const { data: models } = useQuery({
    queryKey: ["video-models"],
    queryFn: () => trpc.models.video.query() as Promise<VideoModel[]>
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  if (inStudio) {
    return (
      <CuratedModelSelect
        label="Video model"
        options={forTasks(STUDIO_CLIP_MODELS, task)}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select Video Model"
        onClick={handleClick}
      />
      <VideoModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleSelect}
        task={task}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(VideoModelSelect, isEqual);
