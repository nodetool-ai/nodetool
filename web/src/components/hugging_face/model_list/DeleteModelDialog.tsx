import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
  Box
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client, authHeader } from "../../../stores/ApiClient";
import { openHuggingfacePath, openOllamaPath, openInExplorer } from "../../../utils/fileExplorer";
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
  const { allModels } = useModels();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());

  const deleteHFModel = async (repoId: string) => {
    setDeletingModels((prev) => new Set(prev).add(repoId));
    try {
      const { error } = await client.DELETE("/api/models/huggingface", {
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
    if (!modelId) return;

    const model = allModels?.find((m) => m.id === modelId);
    if (!model) return;

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
    !modelId ||
    !modelForExplorer ||
    (modelForExplorer.type !== "llama_model" && !modelForExplorer.path);

  const handleConfirmDelete = async () => {
    if (modelId) {
      const model = allModels?.find((m) => m.id === modelId);
      if (model?.type === "llama_model") {
        await deleteOllamaModel(modelId);
      } else {
        await deleteHFModel(modelId);
      }
    }
    onClose();
  };

  const isDeleting =
    (modelId && deletingModels.has(modelId)) || deleteHFModelMutation.isPending;

  return (
    <Dialog
      open={!!modelId}
      onClose={onClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
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
