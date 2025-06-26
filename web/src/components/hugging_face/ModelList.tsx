/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Typography,
  List,
  ListItemText,
  ListItemButton,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, BASE_URL } from "../../stores/ApiClient";
import { llama_models as staticOllamaModels } from "../../config/models";
import ModelCard from "./ModelCard";
import ModelListItem from "./ModelListItem";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";
import { LlamaModel, UnifiedModel } from "../../stores/ApiTypes";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import {
  prettifyModelType,
  groupModelsByType,
  sortModelTypes
} from "./ModelUtils";
import SearchInput from "../search/SearchInput";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useModelBasePaths } from "../../hooks/useModelBasePaths";
import { useNotificationStore } from "../../stores/NotificationStore";
import { authHeader } from "../../stores/ApiClient";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative"
    },
    ".main": {
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
      height: "100%",
      overflow: "hidden"
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
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: "0.5em 1em",
      position: "sticky",
      top: 0,
      zIndex: 2,
      backgroundColor: theme.palette.c_gray1,
      width: "100%"
    },
    ".model-list-header button": {
      padding: ".4em 1em",
      fontSize: "0.9rem"
    },
    ".content": {
      width: "80%",
      height: "95%",
      flexGrow: 1,
      overflowY: "auto",
      padding: "0 0 4em 1em"
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
      color: theme.palette.c_gray5,
      margin: "0",
      padding: "0 .5em"
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
    },
    ".model-external-link-icon": {
      boxShadow: "none",
      cursor: "pointer",
      padding: "1em",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.25)",
        filter: "saturate(1)"
      }
    },
    ".model-external-link-icon img": {
      cursor: "pointer"
    },
    ".size-and-license": {
      display: "flex",
      flexDirection: "row",
      fontSize: "var(--fontSizeSmaller)",
      gap: "1em"
    }
  });

const ModelList: React.FC = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [modelSource, setModelSource] = useState<"downloaded" | "recommended">(
    "downloaded"
  );
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [selectedModelType, setSelectedModelType] = useState<string>("All");

  // Centralised base path hook
  const { ollamaBasePath } = useModelBasePaths();

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

  // Build a set of IDs that are already downloaded (HF + Ollama)
  const downloadedIds = useMemo(() => {
    const ids = new Set<string>();
    (hfModels || []).forEach((m) => ids.add(m.id));
    (ollamaModels || []).forEach((m) => ids.add(m.id));
    return ids;
  }, [hfModels, ollamaModels]);

  const combinedRecommendedModels = useMemo<UnifiedModel[]>(() => {
    // Merge backend-provided list with curated static list
    const merged = [...(recommendedModels || []), ...staticOllamaModels];
    // Filter out anything that is already downloaded
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
    const sourceGroups =
      modelSource === "recommended"
        ? groupedRecommendedModels
        : groupedHFModels;
    const types = new Set(Object.keys(sourceGroups));
    types.add("Other");
    // Add Ollama category when there are llama models available in the source groups
    if ("llama_model" in sourceGroups || modelSource === "downloaded") {
      types.add("llama_model");
    }
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

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

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

  const handleDeleteClick = (modelId: string) => {
    setModelToDelete(modelId);
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      const isOllama = ollamaModels?.find((m) => m.id === modelToDelete);
      if (isOllama) {
        deleteOllamaModel(modelToDelete);
      } else {
        deleteHFModel(modelToDelete);
      }
    }
    setModelToDelete(null); // Close dialog
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  const handleShowInExplorer = async (modelId: string) => {
    if (modelId) {
      const model =
        ollamaModels?.find((m) => m.id === modelId) ||
        hfModels?.find((m) => m.id === modelId);

      let pathToOpen = model?.path; // Prefer specific model path

      if (model?.type === "llama_model" && !pathToOpen) {
        pathToOpen = ollamaBasePath as string | null | undefined; // Fallback to Ollama base path
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

  // const handleViewModeChange = (
  //   event: React.MouseEvent<HTMLElement>,
  //   newViewMode: "grid" | "list" | null
  // ) => {
  //   if (newViewMode !== null) {
  //     setViewMode(newViewMode);
  //   }
  // };

  const handleModelSourceChange = (
    event: React.MouseEvent<HTMLElement>,
    newSource: "downloaded" | "recommended" | null
  ) => {
    if (newSource !== null) {
      setModelSource(newSource);
      setSelectedModelType("All");
    }
  };

  // Hook into download store
  const downloadStore = useModelDownloadStore();

  const startDownload = React.useCallback(
    (model: UnifiedModel) => {
      const repoId = model.repo_id || model.id;
      downloadStore.startDownload(
        repoId,
        model.type ?? "",
        model.path ?? undefined
      );
      downloadStore.openDialog();
    },
    [downloadStore]
  );

  const renderModels = (models: UnifiedModel[]) => {
    if (models.length === 0) {
      return (
        <Typography variant="body1" sx={{ mt: 2 }}>
          No models found for &quot;{modelSearchTerm}&quot;
        </Typography>
      );
    }

    const allowDelete = modelSource === "downloaded";
    const allowDownload = modelSource === "recommended";
    const allowShowInExplorer = modelSource === "downloaded";

    if (viewMode === "grid") {
      return (
        <Grid className="model-grid-container" container spacing={3}>
          {models.map((model: UnifiedModel, idx: number) => (
            <Grid
              className="model-grid-item"
              item
              xs={12}
              sm={12}
              md={6}
              lg={4}
              xl={3}
              key={`${model.id}-${idx}`}
            >
              <ModelCard
                model={model}
                handleModelDelete={allowDelete ? handleDeleteClick : undefined}
                onDownload={
                  allowDownload ? () => startDownload(model) : undefined
                }
                handleShowInExplorer={
                  allowShowInExplorer ? handleShowInExplorer : undefined
                }
                ollamaBasePath={ollamaBasePath as string | null | undefined}
              />
            </Grid>
          ))}
        </Grid>
      );
    } else {
      return (
        <List>
          {models.map((model: UnifiedModel, idx: number) => (
            <ModelListItem
              key={`${model.id}-${idx}`}
              model={model}
              handleModelDelete={allowDelete ? handleDeleteClick : undefined}
              onDownload={
                allowDownload ? () => startDownload(model) : undefined
              }
              handleShowInExplorer={
                allowShowInExplorer ? handleShowInExplorer : undefined
              }
              hideMissingInfo={modelSource === "recommended"}
              ollamaBasePath={ollamaBasePath as string | null | undefined}
            />
          ))}
        </List>
      );
    }
  };

  const isLoading =
    (modelSource === "downloaded" && (hfLoading || ollamaLoading)) ||
    (modelSource === "recommended" && recommendedLoading);

  const isFetching =
    (modelSource === "downloaded" && (hfIsFetching || ollamaIsFetching)) ||
    (modelSource === "recommended" && recommendedIsFetching);

  if (isLoading) {
    return (
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center"
        }}
      >
        <CircularProgress />
        <Typography variant="h4" mt={2}>
          Loading models
        </Typography>
      </Box>
    );
  }

  if (
    (modelSource === "downloaded" && hfError) ||
    (modelSource === "recommended" && recommendedError)
  ) {
    return (
      <>
        <Typography variant="h3">Could not load models.</Typography>
        {hfError && modelSource === "downloaded" && (
          <Typography variant="body2" color="error">
            HuggingFace Error: {hfError.message}
          </Typography>
        )}
        {ollamaError && modelSource === "downloaded" && (
          <Typography variant="body2" color="error">
            Ollama Error: {ollamaError.message}
          </Typography>
        )}
        {recommendedError && modelSource === "recommended" && (
          <Typography variant="body2" color="error">
            {recommendedError.message}
          </Typography>
        )}
      </>
    );
  }

  return (
    <Box className="huggingface-model-list" css={styles}>
      <Box className="model-list-header">
        <SearchInput
          focusOnTyping={true}
          focusSearchInput={false}
          width={300}
          maxWidth={"300px"}
          onSearchChange={setModelSearchTerm}
          searchTerm={modelSearchTerm}
        />

        <ToggleButtonGroup
          className="toggle-button-group-recommended"
          value={modelSource}
          exclusive
          onChange={handleModelSourceChange}
          aria-label="model source"
          size="medium"
          sx={{
            flexShrink: 0
          }}
        >
          <ToggleButton
            value="downloaded"
            sx={{ fontSize: "0.85rem", padding: "0.5em 1.25em" }}
          >
            Downloaded
          </ToggleButton>
          <ToggleButton
            value="recommended"
            sx={{ fontSize: "0.85rem", padding: "0.5em 1.25em" }}
          >
            Recommended
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box className="main">
        <Box className="sidebar">
          <List>
            {modelTypes.map((type) => (
              <ListItemButton
                className="model-type-button"
                key={type}
                selected={selectedModelType === type}
                onClick={() => handleModelTypeChange(type)}
              >
                <ListItemText primary={prettifyModelType(type)} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box className="content">
          {isFetching && (
            <CircularProgress
              size={20}
              sx={{ position: "absolute", top: "1em", right: "1em", zIndex: 1 }}
            />
          )}
          {deleteHFModelMutation.isPending && <CircularProgress />}
          {deleteHFModelMutation.isError && (
            <Typography color="error">
              {deleteHFModelMutation.error.message}
            </Typography>
          )}
          {deleteHFModelMutation.isSuccess && (
            <Typography color="success">Model deleted successfully</Typography>
          )}

          {selectedModelType === "All" ? (
            <>
              {modelSearchTerm && (
                <Typography variant="h5">
                  Searched models for &quot;{modelSearchTerm}&quot;
                </Typography>
              )}
              {modelTypes
                .slice(1)
                .filter((modelType) => filteredModels[modelType]?.length > 0)
                .map((modelType) => (
                  <Box className="model-list-section" key={modelType} mt={2}>
                    <Typography variant="h2">
                      {prettifyModelType(modelType)}
                    </Typography>
                    {renderModels(filteredModels[modelType] || [])}
                  </Box>
                ))}
            </>
          ) : (
            <Box className="model-list-section" mt={2}>
              <Typography variant="h2">
                {prettifyModelType(selectedModelType)}
              </Typography>
              {renderModels(Object.values(filteredModels)[0])}
            </Box>
          )}

          <Dialog
            open={!!modelToDelete}
            onClose={handleCancelDelete}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle id="alert-dialog-title">
              {"Confirm Deletion"}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                Delete {modelToDelete}?
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              {(() => {
                const modelForExplorer = modelToDelete
                  ? ollamaModels?.find((m) => m.id === modelToDelete) ||
                    hfModels?.find((m) => m.id === modelToDelete)
                  : null;
                let explorerPath = modelForExplorer?.path;
                let isDisabled = !modelToDelete;

                if (modelForExplorer) {
                  if (
                    modelForExplorer.type === "llama_model" &&
                    !explorerPath
                  ) {
                    explorerPath = ollamaBasePath as string | null | undefined; // Use base path for Ollama if specific path missing
                  }
                  isDisabled = !explorerPath; // Disabled if no path (specific or base for Ollama) found
                }

                return (
                  <Button
                    onClick={() =>
                      modelToDelete && handleShowInExplorer(modelToDelete)
                    }
                    disabled={isDisabled}
                  >
                    Show in Explorer
                  </Button>
                );
              })()}
              <Button onClick={handleCancelDelete}>Cancel</Button>
              <Button onClick={handleConfirmDelete} autoFocus>
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(ModelList);
