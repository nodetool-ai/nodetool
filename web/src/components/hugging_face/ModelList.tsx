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
import axios from "axios";
import { CachedModel } from "../../stores/ApiTypes";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import {
  prettifyModelType,
  OllamaModel,
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
      // width: "20%",
      minWidth: "200px",
      paddingRight: "2em",
      overflowY: "auto",
      backgroundColor: theme.palette.c_gray1
    },
    ".content": {
      width: "80%",
      height: "95%",
      flexGrow: 1,
      overflowY: "auto",
      padding: theme.spacing(2),
      paddingBottom: "4em"
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
      return data;
    }
  });

  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: async () => {
      const response = await axios.get("http://localhost:11434/api/tags");
      return response.data.models as OllamaModel[];
    }
  });

  const groupedHFModels = useMemo(
    () => groupModelsByType(hfModels || []),
    [hfModels]
  );
  const modelTypes = useMemo(() => {
    const types = new Set(Object.keys(groupedHFModels));
    types.add("Other");
    types.add("Ollama");
    return sortModelTypes(Array.from(types));
  }, [groupedHFModels]);

  const handleModelTypeChange = useCallback((newValue: string) => {
    setSelectedModelType(newValue);
  }, []);

  const filteredModels = useMemo(() => {
    if (selectedModelType === "All") {
      return {
        All: [...Object.values(groupedHFModels).flat(), ...(ollamaModels || [])]
      };
    } else if (selectedModelType === "Ollama") {
      return { Ollama: ollamaModels || [] };
    } else {
      return { [selectedModelType]: groupedHFModels[selectedModelType] || [] };
    }
  }, [selectedModelType, groupedHFModels, ollamaModels]);

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

  const renderModels = (models: (CachedModel | OllamaModel)[]) => {
    if (viewMode === "grid") {
      return (
        <Grid container spacing={3}>
          {models.map((model: CachedModel | OllamaModel) => (
            <Grid
              item
              xs={12}
              sm={12}
              md={6}
              lg={4}
              xl={3}
              key={"repo_id" in model ? model.repo_id : model.name}
            >
              <ModelCard
                model={{
                  id: "repo_id" in model ? model.repo_id : model.name,
                  type:
                    "repo_id" in model
                      ? model.model_type || "hf.model"
                      : "Ollama",
                  name:
                    "repo_id" in model
                      ? model.repo_id
                      : `${model.details.family} - ${model.details.parameter_size}`,
                  description: "",
                  size_on_disk:
                    "size_on_disk" in model ? model.size_on_disk : model.size
                }}
                handleDelete={"repo_id" in model ? handleDeleteClick : () => {}}
              />
            </Grid>
          ))}
        </Grid>
      );
    } else {
      return (
        <List>
          {models.map((model: CachedModel | OllamaModel) => (
            <ModelListItem
              key={"repo_id" in model ? model.repo_id : model.name}
              model={{
                id: "repo_id" in model ? model.repo_id : model.name,
                type:
                  "repo_id" in model
                    ? model.model_type || "hf.model"
                    : "Ollama",
                name:
                  "repo_id" in model
                    ? model.repo_id
                    : `${model.details.family} - ${model.details.parameter_size}`,
                description: "",
                size_on_disk:
                  "size_on_disk" in model ? model.size_on_disk : model.size
              }}
              handleDelete={"repo_id" in model ? handleDeleteClick : () => {}}
            />
          ))}
        </List>
      );
    }
  };

  if (hfLoading || ollamaLoading) {
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

  if (hfError || ollamaError) {
    return (
      <>
        <Typography variant="h3">Could not load models.</Typography>
        {hfError && (
          <Typography variant="body2" color="error">
            HuggingFace Error: {hfError.message}
          </Typography>
        )}
        {ollamaError && (
          <Typography variant="body2" color="error">
            Ollama Error: {ollamaError.message}
          </Typography>
        )}
      </>
    );
  }

  return (
    <Box className="huggingface-model-list" css={styles}>
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
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2
          }}
        >
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
          modelTypes.slice(1).map((modelType) => (
            <Box key={modelType} mt={2}>
              <Typography variant="h2">
                {prettifyModelType(modelType)}
              </Typography>
              {renderModels(
                modelType === "Ollama"
                  ? ollamaModels || []
                  : groupedHFModels[modelType] || []
              )}
            </Box>
          ))
        ) : (
          <Box mt={2}>
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
