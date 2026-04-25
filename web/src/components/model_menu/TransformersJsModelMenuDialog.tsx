import { useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel, UnifiedModel } from "../../stores/ApiTypes";
import { useTransformersJsModelMenuStore } from "../../stores/ModelMenuStore";
import { useTransformersJsModelsByType } from "../../hooks/useModelsByProvider";
import { trpc } from "../../lib/trpc";

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

  // Curated downloads list — drives the "Recommended downloads" panel in
  // ModelMenuDialogBase. Mirrors how HuggingFaceModelMenuDialog fetches
  // recommendations.
  const { data: recommendedModels = [] } = useQuery<UnifiedModel[]>({
    queryKey: ["tjs-recommended", modelType ?? "none"],
    enabled: !!modelType,
    queryFn: async () =>
      (await trpc.models.transformersJsRecommended.query({
        model_type: modelType!
      })) as UnifiedModel[],
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always"
  });

  // Restrict the main list to downloaded models only — recommended-but-uncached
  // entries are surfaced in the "Recommended downloads" tab so the user can
  // fetch them, but they aren't selectable here. Sorted alphabetically by id.
  const modelData = useMemo(
    () => ({
      models: models
        .filter((m) => (m as { downloaded?: boolean }).downloaded === true)
        .sort((a, b) => (a.id || "").localeCompare(b.id || "")),
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
      recommendedModels={recommendedModels}
    />
  );
}

export default memo(TransformersJsModelMenuDialog);
