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
  Chip,
  Stack
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import useNodeTemplatesStore, {
  type NodeTemplate
} from "../../stores/NodeTemplatesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  nodeType: string;
  nodeProperties: Record<string, unknown>;
}

const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = ({
  open,
  onClose,
  nodeType,
  nodeProperties
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const addTemplate = useNodeTemplatesStore((state) => state.addTemplate);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const metadata = getMetadata(nodeType);
  const nodeDisplayName =
    metadata?.title || nodeType.split(".").pop() || nodeType;

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      addNotification({
        type: "warning",
        content: "Please enter a template name",
        timeout: 3000
      });
      return;
    }

    const templateId = addTemplate(
      name.trim(),
      nodeType,
      nodeProperties,
      description.trim() || undefined,
      tags
    );

    addNotification({
      type: "success",
      content: `Template "${name}" saved successfully`,
      timeout: 3000
    });

    onClose();
  }, [
    name,
    nodeType,
    nodeProperties,
    description,
    tags,
    addTemplate,
    addNotification,
    onClose
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && tagInput.trim()) {
        event.preventDefault();
        handleAddTag();
      }
    },
    [tagInput, handleAddTag]
  );

  const handleDialogKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      onKeyDown={handleDialogKeyDown}
    >
      <DialogTitle>
        Save Node Template
        <Button
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            minWidth: 0,
            padding: "8px",
            color: "text.secondary"
          }}
        >
          <CloseIcon />
        </Button>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            placeholder={`${nodeDisplayName} configuration`}
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Describe what this template is used for..."
          />

          <Box>
            <TextField
              label="Tags (press Enter to add)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              fullWidth
              size="small"
              placeholder="Add tags..."
            />
            {tags.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => handleRemoveTag(tag)}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Box
            sx={{
              bgcolor: "action.hover",
              borderRadius: 1,
              p: 1.5
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Base Node Type
            </Typography>
            <Typography variant="body2">{nodeDisplayName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Properties to Save
            </Typography>
            <Typography variant="body2" sx={{ fontSize: "0.75rem" }}>
              {Object.keys(nodeProperties).length} property values will be saved
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim()}
        >
          Save Template
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveTemplateDialog;
