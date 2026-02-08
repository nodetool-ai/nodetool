import React from "react";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
  Box,
  useTheme
} from "@mui/material";
import { Dialog } from "../../ui_primitives";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client, authHeader } from "../../../stores/ApiClient";
import {
  isFileExplorerAvailable,
  openOllamaPath,
  openInExplorer
} from "../../../utils/fileExplorer";
import { BASE_URL } from "../../../stores/BASE_URL";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useState } from "react";
import { useModels } from "./useModels";

interface DeleteModelDialogProps {
  modelId: string | null;
  onClose: () => void;
}

const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  modelId,
  onClose
}) => {
  const theme = useTheme();
  const { allModels } = useModels();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const fileExplorerAvailable = isFileExplorerAvailable();

  const deleteHFModel = async (repoId: string) => {
    setDeletingModels((prev) => new Set(prev).add(repoId));
    try {
      const { error } = await client.DELETE("/api/models/huggingface", {
        params: { query: { repo_id: repoId } }
      });
      if (error) { throw error; }
      addNotification({
        type: "success",
        content: `Deleted model ${repoId}`,
        dismissable: true
      });
      queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
      queryClient.invalidateQueries({ queryKey: ["allModels"] });
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
        `${BASE_URL}/api/models/ollama?model_name=${encodeURIComponent(
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
      queryClient.invalidateQueries({ queryKey: ["allModels"] });
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
    if (!modelId) { return; }

    const model = allModels?.find((m) => m.id === modelId);
    if (!model) { return; }

    const isOllama = model?.type === "llama_model";

    if (isOllama) {
      await openOllamaPath();
    } else if (model?.path) {
      await openInExplorer(model.path);
    } else {
      addNotification({
        type: "warning",
        content: `Could not determine path for model ${modelId}`,
        dismissable: true
      });
    }
  };

  const modelForExplorer = modelId
    ? allModels?.find((m) => m.id === modelId)
    : null;

  const isExplorerDisabled =
    !fileExplorerAvailable ||
    !modelId ||
    !modelForExplorer ||
    (modelForExplorer.type !== "llama_model" && !modelForExplorer.path);

  const handleConfirmDelete = async () => {
    if (modelId) {
      const model = allModels?.find((m) => m.id === modelId);
      try {
        if (model?.type === "llama_model") {
          await deleteOllamaModel(modelId);
        } else {
          await deleteHFModel(modelId);
        }
        onClose();
      } catch (error: any) {
        console.error("Deletion error:", error);

        // Extract error message
        const errorMessage = error.message || "Unknown error";

        // Check if error is "Not Found" (404)
        const isNotFound =
          errorMessage.includes("Not Found") || errorMessage.includes("404");

        if (isNotFound) {
          // If model is not found, treat as success (already deleted)
          addNotification({
            type: "warning",
            content: `Model ${modelId} not found (may have been already deleted)`,
            dismissable: true
          });
          queryClient.invalidateQueries({ queryKey: ["ollamaModels"] });
          queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
          queryClient.invalidateQueries({ queryKey: ["allModels"] });
          onClose();
        } else {
          // Show error for other failures
          addNotification({
            type: "error",
            content: errorMessage,
            dismissable: true
          });
        }
      }
    } else {
      onClose();
    }
  };

  const isDeleting =
    (modelId && deletingModels.has(modelId)) || deleteHFModelMutation.isPending;

  return (
    <Dialog
      open={!!modelId}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.4)`
          }
        },
        paper: {
          sx: {
            borderRadius: "16px",
            backgroundImage: "none"
          }
        }
      }}
    >
      <DialogTitle id="alert-dialog-title">{"Confirm Deletion"}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          Delete {modelId}?
        </DialogContentText>
        {isDeleting && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <CircularProgress />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => modelId && handleShowInExplorer(modelId)}
          disabled={isExplorerDisabled || isDeleting}
        >
          Show in Explorer
        </Button>
        <Button onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button onClick={handleConfirmDelete} autoFocus disabled={isDeleting}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(DeleteModelDialog);
