import React, { memo } from "react";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from "@mui/material";

interface Props {
  modelToDelete: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const ModelDeleteDialog: React.FC<Props> = ({ modelToDelete, onCancel, onConfirm }) => (
  <Dialog open={!!modelToDelete} onClose={onCancel} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
    <DialogTitle id="alert-dialog-title">{"Confirm Deletion"}</DialogTitle>
    <DialogContent>
      <DialogContentText id="alert-dialog-description">Delete {modelToDelete}?</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={onConfirm} autoFocus>
        Delete
      </Button>
    </DialogActions>
  </Dialog>
);

export default memo(ModelDeleteDialog);
