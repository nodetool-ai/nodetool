/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import { useNotificationStore } from "../../stores/NotificationStore";
import dialogStyles from "../../styles/DialogStyles";

import React, { useState, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import { useNodeTemplates } from "../../hooks/useNodeTemplates";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { saveSelectedAsTemplate } = useNodeTemplates();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      addNotification({
        content: "Please enter a template name",
        type: "error",
        alert: true
      });
      return;
    }

    const templateId = saveSelectedAsTemplate(name.trim(), description.trim() || undefined);
    
    if (templateId) {
      addNotification({
        content: `Template "${name}" saved successfully`,
        type: "success"
      });
      setName("");
      setDescription("");
      onClose();
    } else {
      addNotification({
        content: "No nodes selected. Please select nodes to save as a template.",
        type: "error",
        alert: true
      });
    }
  }, [name, description, saveSelectedAsTemplate, addNotification, onClose]);

  const handleClose = useCallback(() => {
    setName("");
    setDescription("");
    onClose();
  }, [onClose]);

  return (
    <Dialog
      style={{ minWidth: "400px" }}
      css={dialogStyles(theme)}
      className="dialog"
      open={open}
      onClose={handleClose}
      aria-labelledby="save-template-dialog-title"
    >
      <DialogTitle id="save-template-dialog-title">
        Save Template
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            placeholder="My Template"
          />
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="What does this template do?"
          />
        </Box>
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={handleClose}>
          Cancel
        </Button>
        <Button className="button-confirm" onClick={handleSave} autoFocus>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveTemplateDialog;
