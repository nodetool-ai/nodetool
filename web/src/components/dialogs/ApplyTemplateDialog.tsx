/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import { useNotificationStore } from "../../stores/NotificationStore";
import dialogStyles from "../../styles/DialogStyles";

import React, { useState, useCallback, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNodeTemplates } from "../../hooks/useNodeTemplates";
import { NodeTemplate } from "../../stores/NodeTemplatesStore";

interface ApplyTemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ApplyTemplateDialog: React.FC<ApplyTemplateDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const { getTemplates, deleteTemplate, applyTemplate } = useNodeTemplates();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const templates = useMemo(() => getTemplates(), [getTemplates]);
  const [selectedTemplate, setSelectedTemplate] = useState<NodeTemplate | null>(null);

  const handleSelect = useCallback((template: NodeTemplate) => {
    setSelectedTemplate(template);
  }, []);

  const handleApply = useCallback(() => {
    if (!selectedTemplate) {
      return;
    }

    // Apply the template at the current viewport center or a default position
    applyTemplate(selectedTemplate, { x: 100, y: 100 });
    
    addNotification({
      content: `Template "${selectedTemplate.name}" applied`,
      type: "success"
    });
    
    setSelectedTemplate(null);
    onClose();
  }, [selectedTemplate, applyTemplate, addNotification, onClose]);

  const handleDelete = useCallback((templateId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      deleteTemplate(templateId);
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
      addNotification({
        content: `Template "${template.name}" deleted`,
        type: "info"
      });
    }
  }, [templates, selectedTemplate, deleteTemplate, addNotification]);

  const handleClose = useCallback(() => {
    setSelectedTemplate(null);
    onClose();
  }, [onClose]);

  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }, []);

  return (
    <Dialog
      style={{ minWidth: "500px", maxWidth: "600px" }}
      css={dialogStyles(theme)}
      className="dialog"
      open={open}
      onClose={handleClose}
      aria-labelledby="apply-template-dialog-title"
    >
      <DialogTitle id="apply-template-dialog-title">
        Apply Template
      </DialogTitle>
      <DialogContent>
        {templates.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              No templates saved yet. Select nodes and use &quot;Save as Template&quot; to create one.
            </Typography>
          </Box>
        ) : (
          <List sx={{ mt: 1 }}>
            {templates.map((template) => (
              <ListItem
                key={template.id}
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={(e) => handleDelete(template.id, e)}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton
                  selected={selectedTemplate?.id === template.id}
                  onClick={() => handleSelect(template)}
                  sx={{
                    borderRadius: 1,
                    mb: 1,
                    border: 1,
                    borderColor: selectedTemplate?.id === template.id 
                      ? "primary.main" 
                      : "divider",
                    "&.Mui-selected": {
                      bgcolor: "action.selected"
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <ContentCopyIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={template.name}
                    secondary={
                      <React.Fragment>
                        {template.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {template.description}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled">
                          {template.nodes.length} nodes • Created {formatDate(template.createdAt)}
                        </Typography>
                      </React.Fragment>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          className="button-confirm"
          onClick={handleApply}
          disabled={!selectedTemplate}
          autoFocus
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ApplyTemplateDialog;
