/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import {
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography
} from "@mui/material";
import DeleteButton from "./buttons/DeleteButton";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";

const modelSize = (model: any) => (model.size_on_disk / 1024 / 1024).toFixed(2).toString() + " MB";

const styles = (theme: any) =>
  css({
    "&.huggingface-model-list": {
      height: "70vh",
      overflow: "auto",
      backgroundColor: theme.palette.c_gray1,
      padding: theme.spacing(2)
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

const HuggingFaceModelList: React.FC = () => {
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: models,
    isLoading,
    error
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

  // delete mutation
  const deleteModel = async (repoId: string) => {
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

  const mutation = useMutation({
    mutationFn: deleteModel
  });

  const handleDeleteClick = (repoId: string) => {
    setModelToDelete(repoId);
  };

  const handleConfirmDelete = () => {
    if (modelToDelete) {
      mutation.mutate(modelToDelete);
      setModelToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setModelToDelete(null);
  };

  if (isLoading) {
    return <CircularProgress />;
  }

  if (error) {
    return <Typography color="error"> {error.message} </Typography>;
  }
  const modelList = models?.map((model) => (
    <ListItem className="model-item" key={model.repo_id}>
      <ListItemText
        className="model-text"
        primary={model.repo_id}
        secondary={modelSize(model) + ` | ${model.pipeline_tag}`}
      />
      {deletingModels.has(model.repo_id) ? (
        <CircularProgress size={24} />
      ) : (
        <DeleteButton onClick={() => handleDeleteClick(model.repo_id)} />
      )}
    </ListItem>
  ));

  return (
    <Box className="huggingface-model-list" css={styles}>
      <Typography variant="h5">Existing Models</Typography>
      {mutation.isPending && <CircularProgress />}
      {mutation.isError && (
        <Typography color="error">{mutation.error.message}</Typography>
      )}
      {mutation.isSuccess && (
        <Typography color="success">Model deleted successfully</Typography>
      )}
      <List>{modelList}</List>
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

export default HuggingFaceModelList;
