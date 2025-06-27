import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";
import { UnifiedModel } from "../../../stores/ApiTypes";

interface DeleteModelDialogProps {
  modelToDelete: string | null;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => void;
  handleShowInExplorer: (modelId: string) => void;
  ollamaModels: UnifiedModel[] | undefined;
  hfModels: UnifiedModel[] | undefined;
  ollamaBasePath: string | null | undefined;
}

const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  modelToDelete,
  handleCancelDelete,
  handleConfirmDelete,
  handleShowInExplorer,
  ollamaModels,
  hfModels,
  ollamaBasePath
}) => {
  const modelForExplorer = modelToDelete
    ? ollamaModels?.find((m) => m.id === modelToDelete) ||
      hfModels?.find((m) => m.id === modelToDelete)
    : null;
  let explorerPath = modelForExplorer?.path;
  let isExplorerDisabled = !modelToDelete;

  if (modelForExplorer) {
    if (modelForExplorer.type === "llama_model" && !explorerPath) {
      explorerPath = ollamaBasePath as string | null | undefined;
    }
    isExplorerDisabled = !explorerPath;
  }

  return (
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
        <Button
          onClick={() => modelToDelete && handleShowInExplorer(modelToDelete)}
          disabled={isExplorerDisabled}
        >
          Show in Explorer
        </Button>
        <Button onClick={handleCancelDelete}>Cancel</Button>
        <Button onClick={handleConfirmDelete} autoFocus>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(DeleteModelDialog);
