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
import { useModels } from "./useModels";

interface DeleteModelDialogProps {
  modelId: string | null;
  onClose: () => void;
}

const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  modelId,
  onClose
}) => {
  const {
    ollamaModels,
    hfModels,
    ollamaBasePath,
    handleShowInExplorer,
    deleteOllamaModel,
    deleteHFModel,
    deleteHFModelMutation,
    deletingModels
  } = useModels();

  const modelForExplorer = modelId
    ? ollamaModels?.find((m) => m.id === modelId) ||
      hfModels?.find((m) => m.id === modelId)
    : null;

  let explorerPath = modelForExplorer?.path;
  let isExplorerDisabled = !modelId;

  if (modelForExplorer) {
    if (modelForExplorer.type === "llama_model" && !explorerPath) {
      explorerPath = ollamaBasePath as string | null | undefined;
    }
    isExplorerDisabled = !explorerPath;
  }

  const handleConfirmDelete = async () => {
    if (modelId) {
      const isOllama = ollamaModels?.find((m) => m.id === modelId);
      if (isOllama) {
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
