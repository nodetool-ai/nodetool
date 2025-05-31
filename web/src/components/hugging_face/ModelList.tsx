/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useMemo, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

import ModelListSidebar from "./subcomponents/ModelListSidebar";
import ModelListContent from "./subcomponents/ModelListContent";
import ModelDeleteDialog from "./subcomponents/ModelDeleteDialog";
import { LlamaModel, UnifiedModel } from "../../stores/ApiTypes";
import {
  prettifyModelType,
  groupModelsByType,
  sortModelTypes
} from "./ModelUtils";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      height: "100%",
      position: "relative"
    },
    ".sidebar": {
      width: "26%",
      minWidth: "200px",
      maxWidth: "350px",
      paddingRight: "2em",
      overflowY: "auto",
      backgroundColor: theme.palette.c_gray1
    },
    ".model-list-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: "1em"
    },
    ".model-list-header button": {
      padding: ".1em .5em"
    },
    ".content": {
      width: "80%",
      height: "95%",
      flexGrow: 1,
      overflowY: "auto",
      padding: theme.spacing(2),
      paddingBottom: "4em"
    },
    ".model-list-section": {
      marginBottom: theme.spacing(15)
    },
    ".model-list-section.empty-section": {
      marginBottom: theme.spacing(5),
      color: theme.palette.c_gray5
    },
    ".model-list-section.empty-section h4": {
      color: theme.palette.c_gray5
    },
    ".model-item": {
      padding: 0,
      borderBottom: `1px solid ${theme.palette.c_gray0}`,
      marginBottom: theme.spacing(1),
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".model-text": {
      wordBreak: "break-word",
      maxHeight: "3.5em",
      overflow: "hidden"
    },
    ".model-text span": {
      maxHeight: "2.5em",
      overflow: "hidden"
    },
    ".model-text p": {
      paddingTop: theme.spacing(1)
    },
    button: {
      color: theme.palette.c_gray5
    },
    ".model-type-button": {
      backgroundColor: theme.palette.c_gray1,
      "&:hover": {
        color: theme.palette.c_gray6,
        backgroundColor: theme.palette.c_gray1
      }
    },
    ".model-type-button.Mui-selected": {
      backgroundColor: theme.palette.c_gray1
    },
    ".model-type-button span": {
      display: "flex",
      alignItems: "center"
    },
    ".model-type-button img": {
      filter: "saturate(0)"
    },
    ".model-type-button.Mui-selected span": {
      color: theme.palette.c_hl1
    }
  });

const ModelList: React.FC = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [modelSource, setModelSource] =
    useState<"downloaded" | "recommended">("downloaded");
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [selectedModelType, setSelectedModelType] = useState<string>("All");

  const {
    data: hfModels,
    isLoading: hfLoading,
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
          type: model.the_model_type,
          name: model.repo_id,
          repo_id: model.repo_id,
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
          type: model.the_model_type,
          name: model.repo_id,
          repo_id: model.repo_id,
          description: "",
          readme: model.readme ?? "",
          size_on_disk: model.size_on_disk
        })
      );
    },
    refetchOnWindowFocus: false
  });

  const groupedHFModels = useMemo(
    () => groupModelsByType(hfModels || []),
    [hfModels]
  );
  const groupedRecommendedModels = useMemo(
    () => groupModelsByType(recommendedModels || []),
    [recommendedModels]
  );
  const modelTypes = useMemo(() => {
    const sourceGroups =
      modelSource === "recommended" ? groupedRecommendedModels : groupedHFModels;
    const types = new Set(Object.keys(sourceGroups));
    types.add("Other");
    types.add("llama_model");
    return sortModelTypes(Array.from(types));
  }, [groupedHFModels, groupedRecommendedModels, modelSource]);

  const handleModelTypeChange = useCallback((newValue: string) => {
    setSelectedModelType(newValue);
  }, []);

  const filteredModels: Record<string, UnifiedModel[]> = useMemo(() => {
    const filterModel = (model: UnifiedModel) => {
      const searchTerm = modelSearchTerm.toLowerCase();
      return (
        model.name?.toLowerCase().includes(searchTerm) ||
        model.repo_id?.toLowerCase().includes(searchTerm)
      );
    };

    const groups =
      modelSource === "recommended" ? groupedRecommendedModels : groupedHFModels;
    const llama =
      modelSource === "recommended" ? groupedRecommendedModels["llama_model"] : ollamaModels;

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
      queryClient.setQueryData(["huggingFaceModels"], (oldData: any) =>
        oldData.filter((model: any) => model.repo_id !== repoId)
      );
    } finally {
      setDeletingModels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(repoId);
        return newSet;
      });
    }
  };

  const deleteHFModelMutation = useMutation({
    mutationFn: deleteHFModel
  });

  const handleDeleteClick = (repoId: string) => {
    setModelToDelete(repoId);
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      deleteHFModelMutation.mutate(modelToDelete);
      setModelToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  const handleViewModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newViewMode: "grid" | "list" | null
  ) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const handleModelSourceChange = (
    event: React.MouseEvent<HTMLElement>,
    newSource: "downloaded" | "recommended" | null
  ) => {
    if (newSource !== null) {
      setModelSource(newSource);
      setSelectedModelType("All");
    }
  };
  return (

    <Box className="huggingface-model-list" css={styles}>
      <ModelListSidebar
        modelTypes={modelTypes}
        selectedModelType={selectedModelType}
        onModelTypeChange={handleModelTypeChange}
        modelSource={modelSource}
        onModelSourceChange={handleModelSourceChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        modelSearchTerm={modelSearchTerm}
        onSearchChange={setModelSearchTerm}
      />

      <ModelListContent
        filteredModels={filteredModels}
        viewMode={viewMode}
        selectedModelType={selectedModelType}
        modelSearchTerm={modelSearchTerm}
        onDelete={handleDeleteClick}
        modelTypes={modelTypes}
      />

      <ModelDeleteDialog
        modelToDelete={modelToDelete}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </Box>
  );
};

export default React.memo(ModelList);
