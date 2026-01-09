/**
 * SaveTemplateDialog Component
 *
 * Dialog for saving selected nodes as a reusable template.
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Autocomplete
} from "@mui/material";
import { useNodeSelectionTemplate } from "../../hooks/useNodeSelectionTemplate";
import { Node, Edge } from "@xyflow/react";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  selectedNodes: Node[];
  selectedEdges: Edge[];
}

export const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = ({
  open,
  onClose,
  selectedNodes,
  selectedEdges
}) => {
  const { createTemplate, categories } = useNodeSelectionTemplate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("custom");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [nameError, setNameError] = useState(false);

  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("custom");
    setTags([]);
    setTagInput("");
    setNameError(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }

    const templateId = createTemplate(
      name.trim(),
      description.trim(),
      category,
      tags,
      selectedNodes,
      selectedEdges
    );

    console.log("[SaveTemplateDialog] Template created:", {
      id: templateId,
      name: name.trim(),
      nodeCount: selectedNodes.length,
      edgeCount: selectedEdges.length
    });

    handleClose();
  }, [
    name,
    description,
    category,
    tags,
    selectedNodes,
    selectedEdges,
    createTemplate,
    handleClose
  ]);

  const handleAddTag = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && tagInput.trim()) {
        event.preventDefault();
        if (!tags.includes(tagInput.trim())) {
          setTags([...tags, tagInput.trim()]);
        }
        setTagInput("");
      }
    },
    [tags, tagInput]
  );

  const handleDeleteTag = useCallback((tagToDelete: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToDelete));
  }, []);

  const nodeCount = selectedNodes.length;
  const edgeCount = selectedEdges.length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Save Selection as Template</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Save {nodeCount} node{nodeCount !== 1 ? "s" : ""} and{" "}
            {edgeCount} edge{edgeCount !== 1 ? "s" : ""} as a reusable template
          </Typography>
        </Box>

        <TextField
          autoFocus
          fullWidth
          label="Template Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(false);
          }}
          error={nameError}
          helperText={nameError ? "Name is required" : ""}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={2}
          sx={{ mb: 2 }}
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Autocomplete
          freeSolo
          multiple
          options={[]}
          value={tags}
          onChange={(_, newValue) => {
            setTags(newValue.filter((v): v is string => typeof v === "string"));
          }}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const { key: tagKey, ...tagProps } = getTagProps({ index });
              return (
                <Chip
                  key={tagKey}
                  variant="outlined"
                  label={option}
                  {...tagProps}
                  onDelete={() => handleDeleteTag(option)}
                />
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Tags (press Enter to add)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Add tags..."
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={nodeCount === 0}>
          Save Template
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveTemplateDialog;
