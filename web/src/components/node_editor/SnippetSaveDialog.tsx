import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  Stack
} from "@mui/material";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { createSnippetFromSelection, useSnippetStore } from "../../stores/SnippetStore";

interface SnippetSaveDialogProps {
  open: boolean;
  onClose: () => void;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

const SnippetSaveDialog: React.FC<SnippetSaveDialogProps> = ({
  open,
  onClose,
  nodes,
  edges
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const addSnippet = useSnippetStore((state) => state.addSnippet);

  const handleSave = (): void => {
    if (!name.trim()) {
      setError("Please enter a name for the snippet");
      return;
    }

    if (nodes.length < 2) {
      setError("Please select at least 2 nodes to create a snippet");
      return;
    }

    const snippetData = createSnippetFromSelection(
      name.trim(),
      description.trim(),
      nodes,
      edges
    );

    addSnippet(snippetData);
    handleClose();
  };

  const handleClose = (): void => {
    setName("");
    setDescription("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Save as Snippet</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Save this group of connected nodes as a reusable snippet. You can
            quickly add it to any workflow later.
          </Typography>

          <TextField
            autoFocus
            label="Snippet Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!error && !name.trim()}
            helperText={!name.trim() && error ? error : ""}
            sx={{ mb: 2 }}
          />

          <TextField
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this snippet do?"
          />

          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Nodes to save: {nodes.length}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 0.5 }}>
              {nodes.map((node) => (
                <Chip
                  key={node.id}
                  label={node.type?.split(".").pop() || "Unknown"}
                  size="small"
                  variant="outlined"
                />
              ))}
            </Stack>
          </Box>

          {edges.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Connections: {edges.length}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={nodes.length < 2}>
          Save Snippet
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SnippetSaveDialog;
