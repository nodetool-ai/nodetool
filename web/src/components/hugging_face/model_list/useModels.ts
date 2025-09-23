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
import { useQuery } from "@tanstack/react-query";

export const useModels = () => {
  const { modelSearchTerm, selectedModelType, maxModelSizeGB } =
    useModelManagerStore();
  const { ollamaBasePath } = useModelBasePaths();
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

  const modelTypes = useMemo(() => {
    const allTypes = new Set<string>();
    allTypes.add("All");
    allTypes.add("llama_model");
    Object.keys(groupedModels).forEach((type) => allTypes.add(type));
    allTypes.add("Other");
    return sortModelTypes(Array.from(allTypes));
  }, [groupedModels]);

  const filteredModels: UnifiedModel[] = useMemo(() => {
    const filterModel = (model: UnifiedModel) => {
      const searchTerm = modelSearchTerm.toLowerCase();
      const matchesText =
        model.name?.toLowerCase().includes(searchTerm) ||
        model.repo_id?.toLowerCase().includes(searchTerm);
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
      return true;
    };
    return allModels?.filter(filterModel) || [];
  }, [allModels, modelSearchTerm, selectedModelType, maxModelSizeGB]);

  const handleShowInExplorer = async (modelId: string) => {
    if (!modelId) return;

    const model = allModels?.find((m) => m.id === modelId);
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

  return {
    modelTypes,
    allModels,
    groupedModels,
    filteredModels,
    isLoading: isLoading,
    isFetching: isFetching,
    error: error,
    handleShowInExplorer,
    ollamaBasePath
  };
};
