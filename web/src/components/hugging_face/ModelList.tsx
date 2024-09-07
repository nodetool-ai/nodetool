/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState } from "react";
import { Box, Button, CircularProgress, Grid, Typography } from "@mui/material";
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
import { devError } from "../../utils/DevLog";
import axios from "axios";

// Add this new type definition
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

const styles = (theme: any) =>
  css({
    "&.huggingface-model-list": {
      height: "80vh",
      overflowY: "auto",
      backgroundColor: theme.palette.c_gray1,
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
    }
  });

const ModelList: React.FC = () => {
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  // Add this new query for Ollama models
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
      <>
        <CircularProgress />
        <Typography variant="h4">Loading models</Typography>
      </>
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
            Ollama Error: {(ollamaError as Error).message}
          </Typography>
        )}
      </>
    );
  }

  return (
    <Box className="huggingface-model-list" css={styles}>
      <Typography variant="h5">Existing Models</Typography>
      {deleteHFModelMutation.isPending && <CircularProgress />}
      {deleteHFModelMutation.isError && (
        <Typography color="error">
          {deleteHFModelMutation.error.message}
        </Typography>
      )}
      {deleteHFModelMutation.isSuccess && (
        <Typography color="success">Model deleted successfully</Typography>
      )}
      <Grid container spacing={3}>
        {hfModels?.map((model) => (
          <Grid item xs={12} sm={12} md={6} lg={4} xl={3} key={model.repo_id}>
            {model.repo_id !== "" && (
              <>
                <ModelCard
                  model={{
                    id: model.repo_id,
                    type: "hf.model",
                    name: model.repo_id,
                    description: "",
                    size_on_disk: model.size_on_disk
                  }}
                  handleDelete={handleDeleteClick}
                />
              </>
            )}
          </Grid>
        ))}
        {ollamaModels?.map((model) => (
          <Grid item xs={12} sm={12} md={6} lg={4} xl={3} key={model.name}>
            <ModelCard
              model={{
                id: model.name,
                type: "llama_model",
                name: `${model.details.family} - ${model.details.parameter_size}`,
                size_on_disk: model.size
              }}
              handleDelete={() => {}} // Implement delete functionality for Ollama models if needed
            />
          </Grid>
        ))}
      </Grid>

      <Dialog
        open={!!modelToDelete}
        onClose={handleCancelDelete}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"Confirm Deletion"}</DialogTitle>
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
  );
};

export default ModelList;
