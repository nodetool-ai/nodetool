/**
 * SaveVersionDialog Component
 *
 * Dialog for manually saving a workflow version checkpoint.
 */

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress
} from "@mui/material";
import { CreateWorkflowVersionRequest } from "../../stores/ApiTypes";

interface SaveVersionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (request: CreateWorkflowVersionRequest) => Promise<void>;
  isCreating: boolean;
  workflowName: string;
}

export const SaveVersionDialog: React.FC<SaveVersionDialogProps> = ({
  open,
  onClose,
  onSave,
  isCreating,
  workflowName
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = useCallback(async () => {
    await onSave({ name: name || undefined, description: description || undefined });
    setName("");
    setDescription("");
  }, [name, description, onSave]);

  const handleClose = useCallback(() => {
    if (!isCreating) {
      setName("");
      setDescription("");
      onClose();
    }
  }, [isCreating, onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6">Save Version Checkpoint</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Create a named checkpoint for workflow &quot;{workflowName}&quot;. This will be saved in version history.
          </Typography>
          <TextField
            label="Version Name (optional)"
            placeholder="e.g., 'Before LLM change'"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            disabled={isCreating}
          />
          <TextField
            label="Description (optional)"
            placeholder="Describe what changed in this version..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            disabled={isCreating}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={isCreating}
          startIcon={isCreating ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isCreating ? "Saving..." : "Save Version"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveVersionDialog;
