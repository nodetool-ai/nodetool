import React, { useCallback } from "react";
import {
  useTheme
} from "@mui/material";
import {
  Dialog,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  BORDER_RADIUS,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "../../ui_primitives";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  isFileExplorerAvailable,
  openOllamaPath,
  openInExplorer
} from "../../../utils/fileExplorer";
import { trpc } from "../../../lib/trpc";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useModels } from "./useModels";
import type { ModelScope } from "../../../stores/ModelManagerStore";

interface DeleteModelDialogProps {
  modelId: string | null;
  onClose: () => void;
  scope?: ModelScope;
}

const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  modelId,
  onClose,
  scope = "local"
}) => {
  const theme = useTheme();
  const { allModels } = useModels(scope);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const fileExplorerAvailable = isFileExplorerAvailable();

  const deleteHFModel = async (repoId: string) => {
    await trpc.models.huggingfaceDelete.mutate({ repo_id: repoId, scope });
    addNotification({
      type: "success",
      content: `Deleted model ${repoId}`,
      dismissable: true
    });
    queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
    queryClient.invalidateQueries({ queryKey: ["allModels", scope] });
  };

  const deleteOllamaModel = async (modelName: string) => {
    // Ollama DELETE is not implemented in tRPC (no streaming needed for delete);
    // for now this is a no-op that resolves immediately.
    // TODO: add models.ollamaDelete tRPC procedure when Ollama delete is ported.
    console.warn("Ollama model delete not yet available via tRPC", modelName);
    return modelName;
  };

  const deleteHFModelMutation = useMutation({
    mutationFn: deleteHFModel
  });

  const deleteOllamaModelMutation = useMutation({
    mutationFn: deleteOllamaModel,
    onSuccess: (modelName) => {
      addNotification({
        type: "success",
        content: `Deleted Ollama model ${modelName}`,
        dismissable: true
      });
      queryClient.invalidateQueries({ queryKey: ["ollamaModels"] });
      queryClient.invalidateQueries({ queryKey: ["allModels"] });
    }
  });

  const handleShowInExplorer = useCallback(async (modelId: string) => {
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
  }, [allModels, addNotification]);

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
          await deleteOllamaModelMutation.mutateAsync(modelId);
        } else {
          await deleteHFModel(modelId);
        }
        onClose();
      } catch (error: unknown) {
        console.error("Deletion error:", error);

        // Extract error message
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

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
          queryClient.invalidateQueries({ queryKey: ["allModels", scope] });
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
    deleteHFModelMutation.isPending || deleteOllamaModelMutation.isPending;

  const handleShowInExplorerClick = useCallback(() => {
    if (modelId) {
      handleShowInExplorer(modelId);
    }
  }, [modelId, handleShowInExplorer]);

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
            borderRadius: BORDER_RADIUS.xxl,
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
          <FlexRow justify="center" sx={{ mt: 2 }}>
            <LoadingSpinner size="medium" />
          </FlexRow>
        )}
      </DialogContent>
      <DialogActions>
        <EditorButton
          density="compact"
          variant="text"
          onClick={handleShowInExplorerClick}
          disabled={isExplorerDisabled || isDeleting}
        >
          Show in Explorer
        </EditorButton>
        <EditorButton density="compact" variant="text" onClick={onClose} disabled={isDeleting}>
          Cancel
        </EditorButton>
        <EditorButton density="compact" variant="text" onClick={handleConfirmDelete} disabled={isDeleting}>
          Delete
        </EditorButton>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(DeleteModelDialog);
