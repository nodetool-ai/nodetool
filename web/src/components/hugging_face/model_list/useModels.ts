import { useMemo } from "react";
import { client } from "../../../stores/ApiClient";
import { UnifiedModel } from "../../../stores/ApiTypes";
import {
  groupModelsByType,
  sortModelTypes
} from "../../../utils/modelFormatting";
import { useModelBasePaths } from "../../../hooks/useModelBasePaths";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useHuggingFaceModels } from "../../../hooks/useHuggingFaceModels";
import { useOllamaModels } from "../../../hooks/useOllamaModels";
import { useRecommendedModels } from "../../../hooks/useRecommendedModels";

export type ModelSource = "downloaded" | "recommended";

export const useModels = () => {
  const { modelSource, modelSearchTerm, selectedModelType } =
    useModelManagerStore();
  const { ollamaBasePath } = useModelBasePaths();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { hfModels, hfLoading, hfIsFetching, hfError } = useHuggingFaceModels();

  const { ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError } =
    useOllamaModels();

  const downloadedIds = useMemo(() => {
    const ids = new Set<string>();
    (hfModels || []).forEach((m) => ids.add(m.id));
    (ollamaModels || []).forEach((m) => ids.add(m.id));
    return ids;
  }, [hfModels, ollamaModels]);

  const {
    recommendedModels,
    recommendedLoading,
    recommendedIsFetching,
    recommendedError,
    combinedRecommendedModels
  } = useRecommendedModels({ downloadedIds });

  const groupedRecommendedModels = useMemo(
    () => groupModelsByType(combinedRecommendedModels),
    [combinedRecommendedModels]
  );

  const groupedHFModels = useMemo(
    () => groupModelsByType(hfModels || []),
    [hfModels]
  );

  const modelTypes = useMemo(() => {
    const allTypes = new Set<string>();
    allTypes.add("All");
    allTypes.add("llama_model");
    allTypes.add("llama_cpp");
    allTypes.add("mlx");
    Object.keys(groupedHFModels).forEach((type) => allTypes.add(type));
    Object.keys(groupedRecommendedModels).forEach((type) => allTypes.add(type));
    allTypes.add("Other");
    return sortModelTypes(Array.from(allTypes));
  }, [groupedHFModels, groupedRecommendedModels]);

  const filteredModels: Record<string, UnifiedModel[]> = useMemo(() => {
    const filterModel = (model: UnifiedModel) => {
      const searchTerm = modelSearchTerm.toLowerCase();
      return (
        model.name?.toLowerCase().includes(searchTerm) ||
        model.repo_id?.toLowerCase().includes(searchTerm)
      );
    };

    const isGGUFRepo = (model: UnifiedModel) => {
      const id = (model.repo_id || model.id || "").toLowerCase();
      return id.includes("gguf");
    };

    const isMlxRepo = (model: UnifiedModel) => {
      const id = (model.repo_id || model.id || "").toLowerCase();
      return id.includes("mlx");
    };

    const groups =
      modelSource === "recommended"
        ? groupedRecommendedModels
        : groupedHFModels;
    const llama =
      modelSource === "recommended"
        ? groupedRecommendedModels["llama_model"]
        : ollamaModels;
    const sourceAll = Object.values(groups).flat() as UnifiedModel[];

    if (selectedModelType === "All") {
      const allModels = [
        ...Object.values(groups).flat(),
        ...(modelSource === "recommended" ? [] : ollamaModels || [])
      ];
      return allModels.filter(filterModel) as UnifiedModel[];
    } else if (selectedModelType === "llama_model") {
      return { llama_model: (llama || []).filter(filterModel) };
    } else if (selectedModelType === "mlx") {
      return {
        mlx: (sourceAll || []).filter((m) => isMlxRepo(m) && filterModel(m))
      };
    } else if (selectedModelType === "llama_cpp") {
      return {
        llama_cpp: sourceAll.filter((m) => isGGUFRepo(m) && filterModel(m))
      };
    } else {
      const source = groups[selectedModelType] || [];
      return {
        [selectedModelType]: source.filter(filterModel)
      };
    }
  }, [
    selectedModelType,
    groupedHFModels,
    groupedRecommendedModels,
    ollamaModels,
    modelSearchTerm,
    modelSource
  ]);

  const handleShowInExplorer = async (modelId: string) => {
    if (!modelId) return;

    const model =
      ollamaModels?.find((m) => m.id === modelId) ||
      hfModels?.find((m) => m.id === modelId);

    const isOllama = model?.type === "llama_model";
    const pathToShow = isOllama ? ollamaBasePath : model?.path;

    if (pathToShow) {
      const { error } = await client.POST("/api/models/open_in_explorer", {
        params: {
          query: {
            path: pathToShow
          }
        }
      });
      if (error) {
        addNotification({
          type: "error",
          content: `Could not open folder: ${JSON.stringify(error)}`,
          dismissable: true
        });
      }
    } else {
      addNotification({
        type: "warning",
        content: `Could not determine path for model ${modelId}`,
        dismissable: true
      });
    }
  };

  const isLoading =
    (modelSource === "downloaded" && (hfLoading || ollamaLoading)) ||
    (modelSource === "recommended" && recommendedLoading);

  const isFetching =
    (modelSource === "downloaded" && (hfIsFetching || ollamaIsFetching)) ||
    (modelSource === "recommended" && recommendedIsFetching);

  return {
    // Used by ModelListIndex
    modelTypes,
    filteredModels,
    isLoading,
    isFetching,
    hfError,
    ollamaError,
    recommendedError,
    groupedHFModels,
    groupedRecommendedModels,
    // Used by ModelTypeSidebar
    ollamaModels,
    // Used by ModelDisplay
    handleShowInExplorer,
    ollamaBasePath
  };
};
