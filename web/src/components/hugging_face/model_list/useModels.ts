import { useMemo } from "react";
import { client } from "../../../stores/ApiClient";
import { UnifiedModel } from "../../../stores/ApiTypes";
import {
  groupModelsByType,
  sortModelTypes
} from "../../../utils/modelFormatting";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { useQuery } from "@tanstack/react-query";
import { openInExplorer, openOllamaPath } from "../../../utils/fileExplorer";

export const useModels = () => {
  const {
    modelSearchTerm,
    selectedModelType,
    maxModelSizeGB,
    filterStatus
  } = useModelManagerStore();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const {
    data: allModels,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["allModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/all", {});
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: false
  });

  const groupedModels = useMemo(
    () => groupModelsByType(allModels || []),
    [allModels]
  );

  const filteredModels: UnifiedModel[] = useMemo(() => {
    const filterModel = (model: UnifiedModel) => {
      const searchTerm = modelSearchTerm.toLowerCase();
      const matchesText =
        model.name?.toLowerCase().includes(searchTerm) ||
        model.repo_id?.toLowerCase().includes(searchTerm);
      // When counting "filtered" models, we do NOT filter by type here if "All" is selected,
      // because the count logic is handled differently or we want the total count to reflect
      // all models matching search/size/download status.
      // HOWEVER, if the user selects a specific type, we DO filter by it.
      const typeMatches =
        selectedModelType === "All" || model.type === selectedModelType;

      if (!matchesText) return false;
      if (!typeMatches) return false;
      if (
        maxModelSizeGB &&
        model.size_on_disk &&
        model.size_on_disk > maxModelSizeGB * 1024 ** 3
      )
        return false;

      if (filterStatus === "downloaded" && !model.downloaded) return false;
      if (filterStatus === "not_downloaded" && model.downloaded) return false;

      return true;
    };
    return allModels?.filter(filterModel) || [];
  }, [
    allModels,
    modelSearchTerm,
    selectedModelType,
    maxModelSizeGB,
    filterStatus
  ]);

  const modelTypes = useMemo(() => {
    const allTypes = new Set<string>();
    allTypes.add("All");

    // Get unique types from all models
    allModels?.forEach((model) => {
      if (model.type) {
        allTypes.add(model.type);
      }
    });

    return sortModelTypes(Array.from(allTypes));
  }, [allModels]);

    // Get available model types based on current filters (for sidebar visibility)
  const availableModelTypes = useMemo(() => {
    const types = new Set<string>();
    types.add("All");

    // Get types from filtered models (excluding type filter)
    const modelsForTypeList =
      allModels?.filter((model) => {
        const searchTerm = modelSearchTerm.toLowerCase();
        const matchesText =
          model.name?.toLowerCase().includes(searchTerm) ||
          model.repo_id?.toLowerCase().includes(searchTerm);

        if (!matchesText) return false;
        if (
          maxModelSizeGB &&
          model.size_on_disk &&
          model.size_on_disk > maxModelSizeGB * 1024 ** 3
        )
          return false;

        if (filterStatus === "downloaded" && !model.downloaded) return false;
        if (filterStatus === "not_downloaded" && model.downloaded) return false;

        return true;
      }) || [];

    modelsForTypeList.forEach((model) => {
      if (model.type) {
        types.add(model.type);
      }
    });

    return types;
  }, [allModels, modelSearchTerm, maxModelSizeGB, filterStatus]);

  const handleShowInExplorer = async (modelId: string) => {
    if (!modelId) return;

    const model = allModels?.find((m) => m.id === modelId);
    if (!model) return;

    const isOllama = model.type === "llama_model";

    if (isOllama) {
      await openOllamaPath();
    } else if (model.path) {
      await openInExplorer(model.path);
    } else {
      addNotification({
        type: "warning",
        content: `Could not determine path for model ${modelId}`,
        dismissable: true
      });
    }
  };

  return {
    modelTypes,
    availableModelTypes,
    allModels,
    groupedModels,
    filteredModels,
    isLoading: isLoading,
    isFetching: isFetching,
    error: error,
    handleShowInExplorer
  };
};
