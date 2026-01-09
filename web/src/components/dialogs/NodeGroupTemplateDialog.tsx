/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Tooltip from "@mui/material/Tooltip";
import { useNodeGroupTemplates } from "../../hooks/useNodeGroupTemplates";
import { useNodes } from "../../contexts/NodeContext";
import { NodeGroupTemplate } from "../../stores/NodeGroupTemplateStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { formatDistanceToNow } from "date-fns";

interface NodeGroupTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onInsertTemplate?: (templateId: string) => void;
}

const NodeGroupTemplateDialog: React.FC<NodeGroupTemplateDialogProps> = ({
  open,
  onClose,
  onInsertTemplate
}) => {
  const theme = useTheme();
  const { templates, saveTemplate, deleteTemplate, updateTemplate, insertTemplate } = useNodeGroupTemplates();
  const { getSelectedNodes } = useNodes((state) => ({
    getSelectedNodes: state.getSelectedNodes
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [saveMode, setSaveMode] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      addNotification({
        content: "Please enter a template name",
        type: "error"
      });
      return;
    }

    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      addNotification({
        content: "Please select nodes to save as a template",
        type: "error"
      });
      return;
    }

    const templateId = saveTemplate(templateName.trim(), templateDescription.trim());
    if (templateId) {
      addNotification({
        content: `Template "${templateName}" saved successfully`,
        type: "success"
      });
      setTemplateName("");
      setTemplateDescription("");
      setSaveMode(false);
    }
  };

  const handleInsertTemplate = (template: NodeGroupTemplate) => {
    insertTemplate(template.id);
    addNotification({
      content: `Template "${template.name}" inserted`,
      type: "success"
    });
    onInsertTemplate?.(template.id);
    onClose();
  };

  const handleDeleteTemplate = (templateId: string, templateName: string) => {
    deleteTemplate(templateId);
    addNotification({
      content: `Template "${templateName}" deleted`,
      type: "info"
    });
  };

  const startEditing = (template: NodeGroupTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditDescription(template.description || "");
  };

  const saveEdit = (templateId: string) => {
    if (!editName.trim()) {
      addNotification({
        content: "Template name cannot be empty",
        type: "error"
      });
      return;
    }
    updateTemplate(templateId, {
      name: editName.trim(),
      description: editDescription.trim()
    });
    addNotification({
      content: `Template updated`,
      type: "success"
    });
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const handleClose = () => {
    setSaveMode(false);
    setTemplateName("");
    setTemplateDescription("");
    setEditingId(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="template-dialog-title"
    >
      <DialogTitle id="template-dialog-title">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {saveMode ? "Save Selection as Template" : "Node Group Templates"}
          </Typography>
          {!saveMode && (
            <Tooltip title="Save current selection as template">
              <IconButton
                color="primary"
                onClick={() => setSaveMode(true)}
                size="small"
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {saveMode ? (
          <Box>
            <TextField
              autoFocus
              fullWidth
              label="Template Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              margin="normal"
              placeholder="e.g., Text Processing Pipeline"
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              margin="normal"
              multiline
              rows={2}
              placeholder="Describe what this template does..."
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              {getSelectedNodes().length} selected node(s) will be saved
            </Typography>
          </Box>
        ) : templates.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            py={8}
            sx={{
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderRadius: 2
            }}
          >
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Templates Yet
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
              Select nodes in your workflow and click + to save them as a reusable template
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setSaveMode(true)}
            >
              Create Your First Template
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {templates.map((template) => (
              <Grid
                sx={{
                  gridColumn: {
                    xs: "span 12",
                    sm: "span 6"
                  }
                }}
                key={template.id}
              >
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    transition: "all 0.2s",
                    "&:hover": {
                      borderColor: theme.palette.primary.main,
                      boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.3)}`
                    }
                  }}
                >
                  <CardContent sx={{ pb: 1 }}>
                    {editingId === template.id ? (
                      <Box>
                        <TextField
                          fullWidth
                          size="small"
                          label="Name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          margin="dense"
                        />
                        <TextField
                          fullWidth
                          size="small"
                          label="Description"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          margin="dense"
                          multiline
                          rows={2}
                        />
                        <Box display="flex" gap={1} justifyContent="flex-end" mt={1}>
                          <Button size="small" onClick={cancelEdit}>
                            Cancel
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => saveEdit(template.id)}
                          >
                            Save
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <>
                        <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                          <Box flex={1}>
                            <Typography variant="subtitle1" fontWeight={600} noWrap>
                              {template.name}
                            </Typography>
                            {template.description && (
                              <Typography variant="body2" color="text.secondary" sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical"
                              }}>
                                {template.description}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={() => startEditing(template)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteTemplate(template.id, template.name)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                        <Box display="flex" gap={2} mt={1}>
                          <Typography variant="caption" color="text.secondary">
                            {template.nodes.length} node{template.nodes.length !== 1 ? "s" : ""}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Used {template.usageCount} time{template.usageCount !== 1 ? "s" : ""}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDistanceToNow(template.createdAt, { addSuffix: true })}
                          </Typography>
                        </Box>
                      </>
                    )}
                  </CardContent>
                  {editingId !== template.id && (
                    <CardActions sx={{ pt: 0 }}>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={() => handleInsertTemplate(template)}
                        fullWidth
                      >
                        Insert Template
                      </Button>
                    </CardActions>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </DialogContent>

      <DialogActions>
        {saveMode ? (
          <>
            <Button onClick={() => setSaveMode(false)}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSaveTemplate}>
              Save Template
            </Button>
          </>
        ) : (
          <Button onClick={handleClose}>
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default NodeGroupTemplateDialog;
