import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import TransformersJsModelMenuDialog from "../model_menu/TransformersJsModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type {
  ImageModel,
  HuggingFaceModelValue,
  HuggingFaceModelValueInput
} from "../../stores/ApiTypes";
import { useTransformersJsModelsByType } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface TransformersJsModelSelectProps {
  modelType: string;
  onChange: (value: HuggingFaceModelValue) => void;
  value: HuggingFaceModelValueInput;
}

const TransformersJsModelSelect: React.FC<TransformersJsModelSelectProps> = ({
  modelType,
  onChange,
  value
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const { models } = useTransformersJsModelsByType({ modelType });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) return null;
    const searchId = value?.repo_id || value?.id;
    if (!searchId) return null;
    return models.find((m) => (m.id || "") === searchId);
  }, [models, value]);

  const displayInfo = useMemo(() => {
    if (currentSelectedModelDetails) {
      return {
        repoId: currentSelectedModelDetails.id || "",
        path: currentSelectedModelDetails.path || undefined
      };
    }
    if (value?.repo_id || value?.id) {
      return {
        repoId: value.repo_id || value.id || "",
        path: value?.path || undefined
      };
    }
    return {
      repoId: "Select Transformers.js Model",
      path: undefined
    };
  }, [currentSelectedModelDetails, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ImageModel) => {
      const repoId = model.id || "";
      onChange({
        type: modelType,
        repo_id: repoId,
        path: model.path || undefined
      });
      addRecent({
        provider: "transformers_js",
        id: repoId,
        name: model.name || repoId
      });
      setAnchorEl(null);
    },
    [onChange, addRecent, modelType]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!(value?.repo_id || value?.id)}
        label={displayInfo.repoId}
        secondaryLabel={displayInfo.path}
        subLabel="Select Transformers.js Model"
        onClick={handleClick}
      />
      <TransformersJsModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        modelType={modelType}
      />
    </>
  );
};

export default React.memo(TransformersJsModelSelect, isEqual);
