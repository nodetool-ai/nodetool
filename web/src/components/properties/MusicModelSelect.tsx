import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "../../utils/isEqual";
import MusicModelMenuDialog from "../model_menu/MusicModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type {
  MusicModel,
  MusicModelValue,
  ModelPack,
  UnifiedModel
} from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

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
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const { data: models } = useQuery({
    queryKey: ["music-models"],
    queryFn: () => trpc.models.music.query() as Promise<MusicModel[]>
  });

  const modelId = useMemo(() => {
    if (typeof value === "string") {
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

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: MusicModel) => {
      onChange({
        type: "music_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      });
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setAnchorEl(null);
    },
    [onChange, addRecent]
  );

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
        onModelChange={handleDialogModelSelect}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(MusicModelSelect, isEqual);
