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
import { client } from "../../stores/ApiClient";
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

  const renderModels = (models: UnifiedModel[]) => {
    if (models.length === 0) {
      return (
        <Typography variant="body1" sx={{ mt: 2 }}>
          No models found for &quot;{modelSearchTerm}&quot;
        </Typography>
      );
    }

    if (viewMode === "grid") {
      return (
        <Grid className="model-grid-container" container spacing={3}>
          {models.map((model: UnifiedModel) => (
            <Grid
              className="model-grid-item"
              item
              xs={12}
              sm={12}
              md={6}
              lg={4}
              xl={3}
              key={model.id}
            >
              <ModelCard
                model={model}
                handleDelete={
                  model.type !== "llama_model" ? handleDeleteClick : () => {}
                }
              />
            </Grid>
          ))}
        </Grid>
      );
    } else {
      return (
        <List>
          {models.map((model: UnifiedModel) => (
            <ModelListItem
              key={model.id}
              model={model}
              handleDelete={
                model.type !== "llama_model" ? handleDeleteClick : () => {}
              }
            />
          ))}
        </List>
      );
    }
  };

  if (
    (modelSource === "downloaded" && (hfLoading || ollamaLoading)) ||
    (modelSource === "recommended" && recommendedLoading)
  ) {
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
      <Box className="sidebar">
        <Box
          className="model-list-header"
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2
          }}
        >
          <SearchInput
            focusOnTyping={true}
            focusSearchInput={false}
            maxWidth={"9em"}
            onSearchChange={setModelSearchTerm}
            searchTerm={modelSearchTerm}
          />
          <ToggleButtonGroup
            value={modelSource}
            exclusive
            onChange={handleModelSourceChange}
            aria-label="model source"
            size="small"
            sx={{ marginLeft: 1 }}
          >
            <ToggleButton value="downloaded">Downloaded</ToggleButton>
            <ToggleButton value="recommended">Recommended</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            aria-label="view mode"
          >
            <ToggleButton value="grid" aria-label="grid view">
              <ViewModuleIcon />
            </ToggleButton>
            <ToggleButton value="list" aria-label="list view">
              <ViewListIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
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
              <Typography variant="h3">
                Searching models for &quot;{modelSearchTerm}&quot;
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
            <Button onClick={handleCancelDelete}>Cancel</Button>
            <Button onClick={handleConfirmDelete} autoFocus>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default React.memo(ModelList);
