/** @jsxImportSource @emotion/react */
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import useSnippetStore from "../../stores/SnippetStore";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";

interface SnippetSaveDialogProps {
  open: boolean;
  onClose: () => void;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

const dialogStyles = {
  "& .MuiDialog-paper": {
    minWidth: 400,
    maxWidth: 500,
    borderRadius: 3
  }
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  pr: 1
};

const contentStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  py: 2
};

const infoBoxStyle = {
  bgcolor: "action.hover",
  borderRadius: 2,
  p: 2,
  mb: 1
};

export const SnippetSaveDialog: React.FC<SnippetSaveDialogProps> = ({
  open,
  onClose,
  nodes,
  edges
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addSnippet = useSnippetStore((state) => state.addSnippet);

  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setError("Please enter a name for the snippet");
      return;
    }

    if (name.length > 100) {
      setError("Name must be 100 characters or less");
      return;
    }

    if (description.length > 500) {
      setError("Description must be 500 characters or less");
      return;
    }

    try {
      addSnippet(name.trim(), description.trim(), nodes, edges);
      setName("");
      setDescription("");
      setError(null);
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to save snippet";
      setError(errorMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name.trim, description.trim, addSnippet, onClose, nodes, edges]);

  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        handleSave();
      }
      if (event.key === "Escape") {
        handleClose();
      }
    },
    [handleSave, handleClose]
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="snippet-save-dialog-title"
      css={dialogStyles}
      onKeyDown={handleKeyDown}
    >
      <Box sx={headerStyle}>
        <DialogTitle id="snippet-save-dialog-title">
          Save as Snippet
        </DialogTitle>
        <IconButton
          onClick={handleClose}
          size="small"
          aria-label="Close dialog"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={contentStyle}>
        <Box sx={infoBoxStyle}>
          <Typography variant="body2" color="text.secondary">
            This will save {nodeCount} node{nodeCount !== 1 ? "s" : ""}
            {edgeCount > 0 &&
              ` and ${edgeCount} connection${edgeCount !== 1 ? "s" : ""}`}
          </Typography>
        </Box>

        <TextField
          label="Snippet Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          fullWidth
          required
          autoFocus
          error={error !== null && name.trim() === ""}
          helperText={error}
          placeholder="e.g., Image Processing Pipeline"
        />

        <TextField
          label="Description (optional)"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setError(null);
          }}
          fullWidth
          multiline
          rows={3}
          placeholder="Describe what this snippet does..."
          error={error !== null && description.length > 500}
          helperText={
            error && description.length > 500
              ? error
              : `${description.length}/500 characters`
          }
        />
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} variant="outlined">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim()}
        >
          Save Snippet
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SnippetSaveDialog;
