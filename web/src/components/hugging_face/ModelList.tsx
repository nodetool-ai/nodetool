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
  ListItemButton
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import ModelCard from "./ModelCard";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";
import axios from "axios";
import { CachedModel } from "../../stores/ApiTypes";

type OllamaModel = {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
};

import ModelIcon from "../../icons/model.svg";

const prettifyModelType = (type: string) => {
  if (type === "All") return type;

  if (type === "Ollama") {
    return (
      <>
        <img
          src="/ollama.png"
          alt="Ollama"
          style={{
            width: "16px",
            marginRight: "8px",
            filter: "invert(1)"
          }}
        />
        Ollama
      </>
    );
  }

  const parts = type.split(".");
  if (parts[0] === "hf") {
    parts.shift(); // Remove "hf"
    return (
      <>
        <img
          src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
          alt="Hugging Face"
          style={{ width: "20px", marginRight: "8px" }}
        />
        {parts
          .map((part) =>
            part
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          )
          .join(" ")}
      </>
    );
  }

  return (
    <>
      <img
        src={ModelIcon}
        alt="Model"
        style={{
          width: "20px",
          marginRight: "8px",
          filter: "invert(1)"
        }}
      />
      {type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")}
    </>
  );
};

const groupModelsByType = (models: CachedModel[]) => {
  return models.reduce((acc, model) => {
    const type = model.model_type || "Other";
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(model);
    return acc;
  }, {} as Record<string, CachedModel[]>);
};

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row"
    },
    ".sidebar": {
      width: "20%",
      borderRight: `1px solid ${theme.palette.divider}`,
      overflowY: "auto"
    },
    ".content": {
      width: "80%",
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
    ".model-type-button span": {
      display: "flex",
      alignItems: "center"
    }
  });

const ModelList: React.FC = () => {
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

  // ollama query
  const { data: ollamaModels, isLoading: ollamaLoading } = useQuery({
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
    const types = new Set<string>();

    // hf
    Object.keys(groupedHFModels).forEach((key) => {
      if (key.startsWith("hf.")) {
        types.add(key);
      }
    });

    types.add("Ollama");
    types.add("Other");

    return [
      "All",
      ...Array.from(types).sort((a, b) => {
        if (a.startsWith("hf.") && !b.startsWith("hf.")) return -1;
        if (!a.startsWith("hf.") && b.startsWith("hf.")) return 1;
        return a.localeCompare(b);
      })
    ];
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

  // delete mutation
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

  if (hfError) {
    return (
      <>
        <Typography variant="h3">Could not load models.</Typography>
        {hfError && (
          <Typography variant="body2" color="error">
            HuggingFace Error: {hfError.message}
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
              <Grid container spacing={3}>
                {(modelType === "Ollama"
                  ? ollamaModels || []
                  : groupedHFModels[modelType] || []
                ).map((model: CachedModel | OllamaModel) => (
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
                          "size_on_disk" in model
                            ? model.size_on_disk
                            : model.size
                      }}
                      handleDelete={
                        "repo_id" in model ? handleDeleteClick : () => {}
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))
        ) : (
          <Box mt={2}>
            <Typography variant="h2">
              {prettifyModelType(selectedModelType)}
            </Typography>
            <Grid container spacing={3}>
              {Object.entries(filteredModels).map(([modelType, models]) =>
                models.map((model: CachedModel | OllamaModel) => (
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
                          "size_on_disk" in model
                            ? model.size_on_disk
                            : model.size
                      }}
                      handleDelete={
                        "repo_id" in model ? handleDeleteClick : () => {}
                      }
                    />
                  </Grid>
                ))
              )}
            </Grid>
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
