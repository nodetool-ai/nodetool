/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Typography,
  Menu,
  MenuItem
} from "@mui/material";
import {
  BookmarkAdd,
  Bookmark,
  ContentCopy,
  Delete,
  MoreVert,
  Save
} from "@mui/icons-material";
import { useState, useCallback, memo } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { useNodeTemplatesStore, NodeTemplate } from "../../stores/NodeTemplatesStore";
import { useNodes } from "../../contexts/NodeContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { NodeData } from "../../stores/NodeData";

interface NodeTemplatesProps {
  nodeId: string;
  nodeType: string;
  nodeData: NodeData;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const NodeTemplates: React.FC<NodeTemplatesProps> = ({
  nodeId,
  nodeType,
  nodeData,
  onClose
}) => {
  const theme = useTheme();
  const templates = useNodeTemplatesStore((state) =>
    state.getTemplatesForNodeType(nodeType)
  );
  const { addTemplate, deleteTemplate, incrementUsage, renameTemplate } =
    useNodeTemplatesStore();
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim() || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      await addTemplate(
        templateName.trim(),
        nodeType,
        nodeData,
        templateDescription.trim()
      );

      addNotification({
        type: "success",
        content: `Template "${templateName}" saved`
      });

      setSaveDialogOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [templateName, templateDescription, nodeType, nodeData, addTemplate, addNotification, onClose, isSaving]);

  const handleApplyTemplate = useCallback((template: NodeTemplate) => {
    const { properties, id } = template;

    Object.entries(properties).forEach(([key, value]) => {
      if (key in nodeData) {
        updateNodeData(nodeId, { [key]: value });
      }
    });

    incrementUsage(id);

    addNotification({
      type: "success",
      content: `Applied template "${template.name}"`
    });

    onClose();
  }, [nodeId, nodeData, updateNodeData, incrementUsage, addNotification, onClose]);

  const handleDeleteTemplate = useCallback((templateId: string) => {
    const template = useNodeTemplatesStore.getState().getTemplateById(templateId);
    if (template) {
      deleteTemplate(templateId);
      addNotification({
        type: "info",
        content: `Template "${template.name}" deleted`
      });
    }
    setMenuAnchor(null);
    setSelectedTemplateId(null);
  }, [deleteTemplate, addNotification]);

  const handleRenameTemplate = useCallback((templateId: string, newName: string) => {
    renameTemplate(templateId, newName);
    setMenuAnchor(null);
    setSelectedTemplateId(null);
  }, [renameTemplate]);

  const openRenameDialog = useCallback((templateId: string) => {
    const template = useNodeTemplatesStore.getState().getTemplateById(templateId);
    if (template) {
      setRenameName(template.name);
      setSelectedTemplateId(templateId);
      setRenameDialogOpen(true);
    }
    setMenuAnchor(null);
  }, []);

  const handleSaveRename = useCallback(() => {
    if (selectedTemplateId && renameName.trim()) {
      handleRenameTemplate(selectedTemplateId, renameName.trim());
      setRenameDialogOpen(false);
      setRenameName("");
      setSelectedTemplateId(null);
    }
  }, [selectedTemplateId, renameName, handleRenameTemplate]);

  const openMenu = useCallback((event: React.MouseEvent<HTMLElement>, templateId: string) => {
    setMenuAnchor(event.currentTarget);
    setSelectedTemplateId(templateId);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    setSelectedTemplateId(null);
  }, []);

  return (
    <>
      <Box
        css={css({
          padding: theme.spacing(1),
          minWidth: 280,
          maxWidth: 350
        })}
      >
        <Box
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: theme.spacing(1)
          })}
        >
          <Typography
            variant="caption"
            css={css({
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            })}
          >
            Templates
          </Typography>
          <Tooltip title="Save as Template">
            <IconButton
              size="small"
              onClick={() => setSaveDialogOpen(true)}
              css={css({
                "&:hover": {
                  backgroundColor: alpha(
                    theme.vars.palette.primary.main,
                    0.1
                  )
                }
              })}
            >
              <BookmarkAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {templates.length === 0 ? (
          <Box
            css={css({
              textAlign: "center",
              padding: theme.spacing(2),
              color: theme.vars.palette.text.secondary,
              fontSize: theme.vars.fontSizeSmall
            })}
          >
            <Typography variant="body2" css={{ marginBottom: theme.spacing(1) }}>
              No templates for this node type
            </Typography>
            <Typography variant="caption">
              Save current settings as a template for quick reuse
            </Typography>
          </Box>
        ) : (
          <List dense css={css({ padding: 0 })}>
            {templates.map((template) => (
              <ListItem
                key={template.id}
                disablePadding
                css={css({
                  marginBottom: theme.spacing(0.5)
                })}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => openMenu(e, template.id)}
                  >
                    <MoreVert fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton
                  onClick={() => handleApplyTemplate(template)}
                  css={css({
                    borderRadius: "8px",
                    padding: theme.spacing(0.75, 1),
                    "&:hover": {
                      backgroundColor: alpha(
                        theme.vars.palette.primary.main,
                        0.08
                      )
                    }
                  })}
                >
                  <ListItemIcon css={css({ minWidth: 32 })}>
                    <Bookmark fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={template.name}
                    secondary={`Used ${template.usageCount}x`}
                    primaryTypographyProps={{
                      variant: "body2",
                      noWrap: true
                    }}
                    secondaryTypographyProps={{
                      variant: "caption"
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        css={css({
          "& .MuiDialog-paper": {
            borderRadius: "12px",
            backgroundColor: theme.vars.palette.grey[1000]
          }
        })}
      >
        <DialogTitle>
          <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
            <Save fontSize="small" />
            Save as Template
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box css={css({ display: "flex", flexDirection: "column", gap: 2, marginTop: 1 })}>
            <TextField
              autoFocus
              label="Template Name"
              size="small"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              fullWidth
              placeholder="e.g., Claude with detailed prompts"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveTemplate();
                }
              }}
            />
            <TextField
              label="Description (optional)"
              size="small"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="Brief description of this configuration..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSaveDialogOpen(false)}
            variant="text"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveTemplate}
            variant="contained"
            size="small"
            disabled={!templateName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        css={css({
          "& .MuiDialog-paper": {
            borderRadius: "12px",
            backgroundColor: theme.vars.palette.grey[1000]
          }
        })}
      >
        <DialogTitle>
          <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
            <Typography fontSize="small">✏️</Typography>
            Rename Template
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Template Name"
            size="small"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            fullWidth
            placeholder="Enter new template name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSaveRename();
              }
            }}
            sx={{ marginTop: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRenameDialogOpen(false)}
            variant="text"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveRename}
            variant="contained"
            size="small"
            disabled={!renameName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        css={css({
          "& .MuiPaper-root": {
            borderRadius: "8px",
            minWidth: 150
          }
        })}
      >
        {selectedTemplateId && (
          <>
            <MenuItem
              onClick={() => {
                const template = useNodeTemplatesStore
                  .getState()
                  .getTemplateById(selectedTemplateId);
                if (template) {
                  handleApplyTemplate(template);
                }
                closeMenu();
              }}
            >
              <ListItemIcon>
                <ContentCopy fontSize="small" />
              </ListItemIcon>
              Apply
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (selectedTemplateId) {
                  openRenameDialog(selectedTemplateId);
                }
              }}
            >
              <ListItemIcon>
                <Typography fontSize="small">✏️</Typography>
              </ListItemIcon>
              Rename
            </MenuItem>
            <MenuItem
              onClick={() => handleDeleteTemplate(selectedTemplateId)}
              css={css({
                color: theme.vars.palette.error.main
              })}
            >
              <ListItemIcon>
                <Delete fontSize="small" css={{ color: theme.vars.palette.error.main }} />
              </ListItemIcon>
              Delete
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default memo(NodeTemplates, isEqual);
