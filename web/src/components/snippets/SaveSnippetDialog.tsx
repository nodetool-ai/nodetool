/**
 * SaveSnippetDialog
 *
 * Dialog for saving selected nodes as a reusable snippet.
 * Allows users to name and describe their snippet before saving.
 */

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface SaveSnippetDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Number of nodes being saved */
  nodeCount: number;
  /** Called when user confirms save */
  onConfirm: (name: string, description: string) => void;
  /** Called when dialog is cancelled */
  onCancel: () => void;
}

/**
 * Dialog component for saving node snippets
 */
const SaveSnippetDialog: React.FC<SaveSnippetDialogProps> = ({
  open,
  nodeCount,
  onConfirm,
  onCancel
}) => {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setName(value);

      // Validate name
      if (!value.trim()) {
        setNameError("Name is required");
      } else if (value.length > 100) {
        setNameError("Name must be less than 100 characters");
      } else {
        setNameError(null);
      }
    },
    []
  );

  const handleDescriptionChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDescription(event.target.value);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (nameError || !name.trim()) {
      return;
    }
    onConfirm(name.trim(), description.trim());
    // Reset form
    setName("");
    setDescription("");
    setNameError(null);
  }, [name, description, nameError, onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel();
    // Reset form
    setName("");
    setDescription("");
    setNameError(null);
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !nameError && name.trim()) {
        handleConfirm();
      }
    },
    [name, nameError, handleConfirm]
  );

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Save Snippet</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Save {nodeCount} node{nodeCount !== 1 ? "s" : ""} as a reusable snippet
          </Typography>
        </Box>

        <TextField
          autoFocus
          margin="dense"
          label="Snippet Name"
          fullWidth
          value={name}
          onChange={handleNameChange}
          onKeyDown={handleKeyDown}
          error={nameError !== null}
          helperText={nameError || "Required"}
          slotProps={{
            htmlInput: {
              maxLength: 100
            }
          }}
          sx={{ mb: 2 }}
        />

        <TextField
          margin="dense"
          label="Description"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Optional description of what this snippet does..."
          slotProps={{
            htmlInput: {
              maxLength: 500
            }
          }}
        />
      </DialogContent>
      <DialogActions
        sx={{
          px: theme.spacing(2),
          pb: theme.spacing(2)
        }}
      >
        <Button onClick={handleCancel} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!!nameError || !name.trim()}
        >
          Save Snippet
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveSnippetDialog;
