import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, BASE_URL } from "../../../stores/ApiClient";
import { llama_models as staticOllamaModels } from "../../../config/models";
import { LlamaModel, UnifiedModel } from "../../../stores/ApiTypes";
import { groupModelsByType, sortModelTypes } from "../ModelUtils";
import { useModelBasePaths } from "../../../hooks/useModelBasePaths";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { authHeader } from "../../../stores/ApiClient";

export type ModelSource = "downloaded" | "recommended";

export const useModels = () => {
  const [modelSource, setModelSource] = useState<ModelSource>("downloaded");
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [selectedModelType, setSelectedModelType] = useState<string>("All");
  const queryClient = useQueryClient();
  const { ollamaBasePath } = useModelBasePaths();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());

  const {
    data: hfModels,
    isLoading: hfLoading,
    isFetching: hfIsFetching,
    error: hfError
  } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_models",
        {}
      );
      if (error) throw error;
      return data.map(
        (model: any): UnifiedModel => ({
          id: model.repo_id,
          type: model.the_model_type || model.type,
          name: model.repo_id,
          repo_id: model.repo_id,
          path: model.path,
          description: "",
          readme: model.readme ?? "",
          size_on_disk: model.size_on_disk
        })
      );
    },
    refetchOnWindowFocus: false
  });

  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    isFetching: ollamaIsFetching,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/ollama_models", {});
      if (error) throw error;
      return data.map(
        (model: LlamaModel): UnifiedModel => ({
          id: model.name ?? "",
          repo_id: model.repo_id ?? "",
          type: "llama_model",
          name: `${model.details?.family} - ${model.details?.parameter_size}`,
          description: "",
          size_on_disk: model.size
        })
      );
    },
    refetchOnWindowFocus: false
  });

  const {
    data: recommendedModels,
    isLoading: recommendedLoading,
    isFetching: recommendedIsFetching,
    error: recommendedError
  } = useQuery({
    queryKey: ["recommendedModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/recommended_models",
        {}
      );
      if (error) throw error;
      return data.map(
        (model: any): UnifiedModel => ({
          id: model.repo_id,
          type: model.the_model_type || model.type,
          name: model.repo_id,
          repo_id: model.repo_id,
          path: model.path,
          description: "",
          readme: model.readme ?? "",
          size_on_disk: model.size_on_disk
        })
      );
    },
    refetchOnWindowFocus: false
  });

  const downloadedIds = useMemo(() => {
    const ids = new Set<string>();
    (hfModels || []).forEach((m) => ids.add(m.id));
    (ollamaModels || []).forEach((m) => ids.add(m.id));
    return ids;
  }, [hfModels, ollamaModels]);

  const combinedRecommendedModels = useMemo<UnifiedModel[]>(() => {
    const merged = [...(recommendedModels || []), ...staticOllamaModels];
    return merged.filter((m) => !downloadedIds.has(m.id));
  }, [recommendedModels, downloadedIds]);

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
    Object.keys(groupedHFModels).forEach((type) => allTypes.add(type));
    Object.keys(groupedRecommendedModels).forEach((type) => allTypes.add(type));
    allTypes.add("Other");
    allTypes.add("llama_model");
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

    const groups =
      modelSource === "recommended"
        ? groupedRecommendedModels
        : groupedHFModels;
    const llama =
      modelSource === "recommended"
        ? groupedRecommendedModels["llama_model"]
        : ollamaModels;

    if (selectedModelType === "All") {
      const allModels = [
        ...Object.values(groups).flat(),
        ...(modelSource === "recommended" ? [] : ollamaModels || [])
      ];
      const filteredAllModels = allModels.filter(filterModel);
      return Object.fromEntries(
        modelTypes.map((type) => [
          type,
          filteredAllModels.filter((model) =>
            type === "llama_model"
              ? model.type === type
              : model.type === type || (type === "Other" && !model.type)
          )
        ])
      );
    } else if (selectedModelType === "llama_model") {
      return { llama_model: (llama || []).filter(filterModel) };
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
    modelTypes,
    modelSource
  ]);

  const deleteHFModel = async (repoId: string) => {
    setDeletingModels((prev) => new Set(prev).add(repoId));
    try {
      const { error } = await client.DELETE("/api/models/huggingface_model", {
        params: { query: { repo_id: repoId } }
      });
      if (error) throw error;
      addNotification({
        type: "success",
        content: `Deleted model ${repoId}`,
        dismissable: true
      });
      queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
    } finally {
      setDeletingModels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(repoId);
        return newSet;
      });
    }
  };

  const deleteOllamaModel = async (modelName: string) => {
    setDeletingModels((prev) => new Set(prev).add(modelName));
    try {
      const response = await fetch(
        `${BASE_URL}/api/models/ollama_model?model_name=${encodeURIComponent(
          modelName
        )}`,
        {
          method: "DELETE",
          headers: await authHeader()
        }
      );
      if (!response.ok) {
        throw new Error(`Delete failed: ${await response.text()}`);
      }
      addNotification({
        type: "success",
        content: `Deleted Ollama model ${modelName}`,
        dismissable: true
      });
      queryClient.invalidateQueries({ queryKey: ["ollamaModels"] });
    } finally {
      setDeletingModels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(modelName);
        return newSet;
      });
    }
  };

  const deleteHFModelMutation = useMutation({
    mutationFn: deleteHFModel
  });

  const handleShowInExplorer = async (modelId: string) => {
    if (modelId) {
      const model =
        ollamaModels?.find((m) => m.id === modelId) ||
        hfModels?.find((m) => m.id === modelId);

      let pathToOpen = model?.path;

      if (model?.type === "llama_model" && !pathToOpen) {
        pathToOpen = ollamaBasePath as string | null | undefined;
      }

      if (pathToOpen) {
        try {
          await client.POST("/api/models/open_in_explorer", {
            params: { query: { path: pathToOpen } }
          });
        } catch (error) {
          console.error("[ModelList] Failed to open in explorer:", error);
        }
      }
    }
  };

  const handleModelSourceChange = (
    event: React.MouseEvent<HTMLElement>,
    newSource: "downloaded" | "recommended" | null
  ) => {
    if (newSource !== null) {
      setModelSource(newSource);
    }
  };

  const isLoading =
    (modelSource === "downloaded" && (hfLoading || ollamaLoading)) ||
    (modelSource === "recommended" && recommendedLoading);

  const isFetching =
    (modelSource === "downloaded" && (hfIsFetching || ollamaIsFetching)) ||
    (modelSource === "recommended" && recommendedIsFetching);

  return {
    modelSource,
    setModelSource,
    modelSearchTerm,
    setModelSearchTerm,
    selectedModelType,
    setSelectedModelType,
    hfModels,
    hfLoading,
    hfIsFetching,
    hfError,
    ollamaModels,
    ollamaLoading,
    ollamaIsFetching,
    ollamaError,
    recommendedModels,
    recommendedLoading,
    recommendedIsFetching,
    recommendedError,
    groupedRecommendedModels,
    groupedHFModels,
    modelTypes,
    filteredModels,
    deleteHFModel,
    deleteOllamaModel,
    deleteHFModelMutation,
    handleShowInExplorer,
    handleModelSourceChange,
    ollamaBasePath,
    isLoading,
    isFetching,
    deletingModels
  };
};
