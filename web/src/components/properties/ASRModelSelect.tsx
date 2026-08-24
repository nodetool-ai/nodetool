import React, { useMemo } from "react";
import isEqual from "../../utils/isEqual";
import ASRModelMenuDialog from "../model_menu/ASRModelMenuDialog";
import type { ASRModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";
interface ASRModelSelection {
  type: "asr_model";
  id: string;
  provider: string;
  name: string;
}

interface ASRModelSelectProps {
  onChange: (value: ASRModelSelection) => void;
  value: string;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const ASRModelSelect: React.FC<ASRModelSelectProps> = ({
  onChange,
  value,
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("asr_model", onChange);
  const { data: models } = useQuery({
    queryKey: ["asr-models"],
    queryFn: () => trpc.models.asr.query() as Promise<ASRModel[]>
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select ASR Model"
        onClick={handleClick}
      />
      <ASRModelMenuDialog
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

export default React.memo(ASRModelSelect, isEqual);
