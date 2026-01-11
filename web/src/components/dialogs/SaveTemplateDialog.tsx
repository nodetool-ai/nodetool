/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import FolderIcon from "@mui/icons-material/Folder";
import DescriptionIcon from "@mui/icons-material/Description";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import { useNodeTemplatesStore } from "../../stores/NodeTemplatesStore";
import { useNotificationStore } from "../../stores/NotificationStore";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  selectedNodes: Node<NodeData>[];
  selectedEdges: Edge[];
}

const dialogStyles = (theme: Theme) =>
  css({
    "& .MuiDialog-paper": {
      backgroundColor: theme.vars.palette.background.paper,
      backgroundImage: "none",
      borderRadius: "16px",
      minWidth: "400px",
      maxWidth: "500px"
    },
    "& .MuiDialogTitle-root": {
      padding: "20px 24px 12px",
      "& .dialog-title": {
        fontSize: "1.25rem",
        fontWeight: 600,
        color: theme.vars.palette.text.primary,
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }
    },
    "& .MuiDialogContent-root": {
      padding: "12px 24px 20px",
      "& .form-field": {
        marginBottom: "16px"
      },
      "& .MuiTextField-root": {
        width: "100%"
      },
      "& .MuiInputBase-input": {
        padding: "12px 14px"
      },
      "& .MuiFormLabel-root": {
        fontSize: "0.875rem"
      }
    },
    "& .MuiDialogActions-root": {
      padding: "12px 24px 20px",
      gap: "8px",
      "& .button-cancel": {
        color: theme.vars.palette.text.secondary,
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover
        }
      },
      "& .button-confirm": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        "&:hover": {
          backgroundColor: theme.vars.palette.primary.dark
        }
      }
    }
  });

const SaveTemplateDialog = memo(function SaveTemplateDialog({
  open,
  onClose,
  selectedNodes,
  selectedEdges
}: SaveTemplateDialogProps) {
  const theme = useTheme();
  const memoizedStyles = useCallback(() => dialogStyles(theme), [theme]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("My Templates");
  const [nameError, setNameError] = useState(false);

  const { createTemplate, getTemplateCategories } = useNodeTemplatesStore(
    (state) => ({
      createTemplate: state.createTemplate,
      getTemplateCategories: state.getTemplateCategories
    })
  );

  const addNotification = useNotificationStore((state) => state.addNotification);

  const categories = getTemplateCategories();
  const nodeCount = selectedNodes.length;
  const edgeCount = selectedEdges.length;

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    try {
      createTemplate({
        name: trimmedName,
        description: description.trim(),
        category: category.trim() || "My Templates",
        nodes: selectedNodes,
        edges: selectedEdges
      });

      addNotification({
        content: `Template "${trimmedName}" saved successfully`,
        type: "success",
        timeout: 3000
      });

      setName("");
      setDescription("");
      setCategory("My Templates");
      setNameError(false);
      onClose();
    } catch (_error) {
      addNotification({
        content: "Failed to save template",
        type: "error",
        timeout: 4000
      });
    }
  }, [name, description, category, selectedNodes, selectedEdges, createTemplate, addNotification, onClose]);

  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("My Templates");
    setNameError(false);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSave();
      }
      if (event.key === "Escape") {
        handleClose();
      }
    },
    [handleSave, handleClose]
  );

  if (!open) {
    return null;
  }

  return (
    <Dialog
      css={memoizedStyles}
      open={open}
      onClose={handleClose}
      aria-labelledby="save-template-dialog-title"
    >
      <DialogTitle className="dialog-title" id="save-template-dialog-title">
        <FolderIcon fontSize="small" />
        Save as Template
      </DialogTitle>

      <DialogContent>
        <Box className="form-field">
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
            onKeyDown={handleKeyDown}
            error={nameError}
            helperText={nameError ? "Please enter a template name" : ""}
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <DescriptionIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
          />
        </Box>

        <Box className="form-field">
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            rows={2}
            placeholder="Add a description for this template..."
          />
        </Box>

        <Box className="form-field">
          <TextField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={handleKeyDown}
            select
            SelectProps={{ native: true }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <FolderIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
          >
            <option value="My Templates">My Templates</option>
            {categories
              .filter((c) => c !== "My Templates")
              .map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </TextField>
        </Box>

        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mt: 1,
            fontSize: "0.8rem"
          }}
        >
          This will save {nodeCount} {nodeCount === 1 ? "node" : "nodes"} and{" "}
          {edgeCount} {edgeCount === 1 ? "connection" : "connections"} as a reusable
          template.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button className="button-cancel" onClick={handleClose}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleSave} autoFocus>
          Save Template
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default SaveTemplateDialog;
