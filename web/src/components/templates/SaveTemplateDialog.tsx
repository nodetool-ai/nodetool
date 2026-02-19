/**
 * SaveTemplateDialog
 *
 * Dialog component for saving selected nodes as a reusable template.
 * Allows users to specify template name, description, and category.
 */

import React, { useState, useCallback, memo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography
} from "@mui/material";
import type { TemplateCategory } from "../../stores/NodeTemplatesStore";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (options: {
    name: string;
    description: string;
    category: TemplateCategory;
  }) => void;
  defaultName?: string;
  nodeCount?: number;
}

/**
 * Template category options with descriptions
 */
const TEMPLATE_CATEGORIES: readonly {
  value: TemplateCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "common",
    label: "Common",
    description: "Frequently used node combinations"
  },
  {
    value: "image-processing",
    label: "Image Processing",
    description: "Image manipulation and enhancement"
  },
  {
    value: "audio",
    label: "Audio",
    description: "Audio processing and generation"
  },
  {
    value: "video",
    label: "Video",
    description: "Video processing and editing"
  },
  {
    value: "text",
    label: "Text",
    description: "Text processing and NLP"
  },
  {
    value: "data",
    label: "Data",
    description: "Data transformation and analysis"
  },
  {
    value: "ai-models",
    label: "AI Models",
    description: "AI and machine learning workflows"
  },
  {
    value: "custom",
    label: "Custom",
    description: "User-defined templates"
  }
] as const;

/**
 * Dialog for saving selected nodes as a template.
 *
 * Features:
 * - Name and description input
 * - Category selection with descriptions
 * - Form validation
 * - Keyboard shortcuts (Enter to save, Escape to cancel)
 *
 * @example
 * ```typescript
 * <SaveTemplateDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSave={(options) => handleSave(options)}
 *   defaultName="My Template"
 *   nodeCount={3}
 * />
 * ```
 */
const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = memo(({
  open,
  onClose,
  onSave,
  defaultName = "",
  nodeCount = 0
}) => {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("common");
  const [nameError, setNameError] = useState("");

  const resetForm = useCallback(() => {
    setName(defaultName);
    setDescription("");
    setCategory("common");
    setNameError("");
  }, [defaultName]);

  const handleSave = useCallback(() => {
    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Template name is required");
      return;
    }

    if (trimmedName.length < 3) {
      setNameError("Template name must be at least 3 characters");
      return;
    }

    if (trimmedName.length > 50) {
      setNameError("Template name must be less than 50 characters");
      return;
    }

    onSave({
      name: trimmedName,
      description: description.trim(),
      category
    });

    resetForm();
    onClose();
  }, [name, description, category, onSave, resetForm, onClose]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
    if (nameError) {
      setNameError("");
    }
  }, [nameError]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="save-template-dialog-title"
      PaperProps={{
        sx: {
          backgroundColor: "var(--palette-background-paper)",
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle id="save-template-dialog-title" sx={{ typography: "h6" }}>
        Save as Template
      </DialogTitle>

      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
        {nodeCount > 0 && (
          <Box
            sx={{
              px: 2,
              py: 1,
              backgroundColor: "var(--palette-primary-dark)",
              borderRadius: 1,
              mb: 1
            }}
          >
            <Typography variant="body2" color="var(--palette-primary-contrastText)">
              Saving {nodeCount} node{nodeCount !== 1 ? "s" : ""} as a template
            </Typography>
          </Box>
        )}

        <TextField
          autoFocus
          id="template-name"
          label="Template Name"
          fullWidth
          value={name}
          onChange={handleNameChange}
          onKeyDown={handleKeyDown}
          error={Boolean(nameError)}
          helperText={nameError || " "}
          placeholder="e.g., Image Processor Pipeline"
          slotProps={{
            htmlInput: {
              "aria-describedby": "template-name-helper-text"
            }
          }}
          sx={{
            "& .MuiInputBase-input": {
              backgroundColor: "transparent"
            }
          }}
        />

        <TextField
          id="template-description"
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this template does..."
          slotProps={{
            htmlInput: {
              "aria-describedby": "template-description-helper-text"
            }
          }}
        />

        <FormControl fullWidth>
          <InputLabel id="template-category-label">Category</InputLabel>
          <Select
            labelId="template-category-label"
            id="template-category"
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value as TemplateCategory)}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "var(--palette-background-paper)",
                  backgroundImage: "none",
                  maxHeight: 300
                }
              }
            }}
          >
            {TEMPLATE_CATEGORIES.map((cat) => (
              <MenuItem
                key={cat.value}
                value={cat.value}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  py: 1
                }}
              >
                <Typography variant="body2" fontWeight="medium">
                  {cat.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="var(--palette-text-secondary)"
                  sx={{ mt: 0.25 }}
                >
                  {cat.description}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          color="inherit"
          sx={{ mr: 1 }}
        >
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
});

SaveTemplateDialog.displayName = "SaveTemplateDialog";

export default SaveTemplateDialog;
