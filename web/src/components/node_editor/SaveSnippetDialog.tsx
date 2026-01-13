/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Chip,
  Typography,
  useTheme
} from "@mui/material";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useSnippetStore } from "../../stores/SnippetStore";
import { useNotificationStore } from "../../stores/NotificationStore";

interface SaveSnippetDialogProps {
  open: boolean;
  onClose: () => void;
  selectedNodes: Node<NodeData>[];
  selectedEdges: Edge[];
}

const SaveSnippetDialog: React.FC<SaveSnippetDialogProps> = ({
  open,
  onClose,
  selectedNodes,
  selectedEdges
}) => {
  const theme = useTheme();
  const addSnippet = useSnippetStore((state) => state.addSnippet);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [nameError, setNameError] = useState(false);

  const handleAddTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && tagInput.trim()) {
      event.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }

    if (selectedNodes.length === 0) {
      addNotification({
        content: "Please select at least one node to save as a snippet",
        type: "error"
      });
      return;
    }

    try {
      addSnippet(name.trim(), description.trim(), selectedNodes, selectedEdges, tags);
      addNotification({
        content: `Snippet "${name}" saved successfully`,
        type: "success"
      });
      handleClose();
    } catch {
      addNotification({
        content: "Failed to save snippet",
        type: "error"
      });
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setTags([]);
    setTagInput("");
    setNameError(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="save-snippet-dialog-title"
    >
      <DialogTitle id="save-snippet-dialog-title">
        Save Snippet
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label="Snippet Name"
            fullWidth
            variant="outlined"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            error={nameError}
            helperText={nameError ? "Name is required" : "Give your snippet a descriptive name"}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleSave();
              }
            }}
          />

          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this snippet does..."
          />

          <Box>
            <TextField
              label="Tags"
              fullWidth
              variant="outlined"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleAddTag}
              placeholder="Press Enter to add a tag"
              helperText="Add tags to help find this snippet later"
            />
            {tags.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => handleRemoveTag(tag)}
                  />
                ))}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              p: 2,
              bgcolor: "action.hover",
              borderRadius: 1,
              border: 1,
              borderColor: "divider"
            }}
          >
            <Typography variant="body2" color="text.secondary">
              This snippet will include:
            </Typography>
            <Typography variant="body2">
              • {selectedNodes.length} node{selectedNodes.length !== 1 ? "s" : ""}
              {selectedEdges.length > 0 &&
                ` with ${selectedEdges.length} connection${selectedEdges.length !== 1 ? "s" : ""}`}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim() || selectedNodes.length === 0}
        >
          Save Snippet
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveSnippetDialog;
