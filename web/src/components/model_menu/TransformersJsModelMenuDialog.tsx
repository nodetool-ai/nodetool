import { useMemo, memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel } from "../../stores/ApiTypes";
import { useTransformersJsModelMenuStore } from "../../stores/ModelMenuStore";
import { useTransformersJsModelsByType } from "../../hooks/useModelsByProvider";

export interface TransformersJsModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  modelType?: string;
  anchorEl?: HTMLElement | null;
}

function TransformersJsModelMenuDialog({
  open,
  onClose,
  onModelChange,
  modelType,
  anchorEl
}: TransformersJsModelMenuDialogProps) {
  const { models, isLoading, isFetching, error, refetch } =
    useTransformersJsModelsByType({ modelType });

  // Sort: downloaded first, then alphabetical by id. The backend already
  // returns recommended entries in curated order at the top, but we keep
  // downloaded models grouped first so users see "what's ready" up front.
  const modelData = useMemo(
    () => ({
      models: [...models].sort((a, b) => {
        const aDl = (a as { downloaded?: boolean }).downloaded ? 1 : 0;
        const bDl = (b as { downloaded?: boolean }).downloaded ? 1 : 0;
        if (aDl !== bDl) return bDl - aDl;
        return (a.id || "").localeCompare(b.id || "");
      }),
      isLoading,
      isFetching,
      error,
      refetch
    }),
    [models, isLoading, isFetching, error, refetch]
  );

  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Transformers.js Model"
      searchPlaceholder="Search Transformers.js models..."
      storeHook={useTransformersJsModelMenuStore}
    />
  );
}

export default memo(TransformersJsModelMenuDialog);
