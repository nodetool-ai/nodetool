import React, { useMemo } from "react";
import isEqual from "../../utils/isEqual";
import MusicModelMenuDialog from "../model_menu/MusicModelMenuDialog";
import type {
  MusicModel,
  MusicModelValue,
  ModelPack,
  UnifiedModel
} from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";
import { isString } from "../../utils/typePredicates";

interface MusicModelSelectProps {
  onChange: (value: MusicModelValue) => void;
  value: string | MusicModelValue;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const MusicModelSelect: React.FC<MusicModelSelectProps> = ({
  onChange,
  value,
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("music_model", onChange);
  const { data: models } = useQuery({
    queryKey: ["music-models"],
    queryFn: () => trpc.models.music.query() as Promise<MusicModel[]>
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
          currentSelectedModelDetails?.name || modelId || "Select Music Model"
        }
        subLabel="Select Text-to-Music Model"
        onClick={handleClick}
      />
      <MusicModelMenuDialog
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

export default React.memo(MusicModelSelect, isEqual);
