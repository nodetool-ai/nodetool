/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Tooltip,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  TextField,
  CircularProgress,
  Chip,
  FormControlLabel,
  Checkbox
} from "@mui/material";
import React, { useCallback, useState, useEffect, memo } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { createErrorMessage } from "../../utils/errorHandling";
import { useNotificationStore } from "../../stores/NotificationStore";
import FileBrowserDialog from "../dialogs/FileBrowserDialog";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import PanelHeadline from "../ui/PanelHeadline";

const styles = (theme: Theme) =>
  css({
    ".workspaces-manager": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden"
    },
    ".workspace-list": {
      flex: 1,
      overflowY: "auto",
      padding: "0"
    },
    ".workspace-item": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      padding: theme.spacing(1.5, 2),
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".workspace-item-content": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5)
    },
    ".workspace-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "1.5rem"
    },
    ".workspace-info": {
      flex: 1,
      minWidth: 0
    },
    ".workspace-name": {
      fontWeight: 500,
      fontSize: "0.95rem",
      color: theme.vars.palette.text.primary
    },
    ".workspace-path": {
      fontSize: "0.8rem",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workspace-badges": {
      display: "flex",
      gap: theme.spacing(0.5),
      marginTop: theme.spacing(0.5)
    },
    ".add-workspace-section": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      padding: theme.spacing(2),
      backgroundColor: theme.vars.palette.background.default
    },
    ".add-form": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5)
    },
    ".form-row": {
      display: "flex",
      gap: theme.spacing(1),
      alignItems: "flex-start"
    },
    ".browse-button": {
      marginTop: "8px",
      minWidth: "auto",
      padding: "6px 12px"
    },
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: theme.spacing(2, 3),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backdropFilter: "blur(10px)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".close-button": {
      color: theme.vars.palette.text.secondary,
      transition: "color 0.2s",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(4),
      color: theme.vars.palette.text.secondary
    },
    ".edit-form": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      width: "100%"
    }
  });

// Fetch workspaces
const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces", {
    params: { query: { limit: 100 } }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workspaces");
  }
  return data.workspaces;
};

// Check if native dialog API is available (running in Electron)
const hasNativeDialog = (): boolean => {
  return typeof window !== "undefined" && window.api?.dialog !== undefined;
};

interface WorkspacesManagerProps {
  open: boolean;
  onClose: () => void;
}

const WorkspacesManager: React.FC<WorkspacesManagerProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Form state
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null);

  // Query workspaces
  const {
    data: workspaces,
    isLoading,
    error
  } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    enabled: open
  });

  // Create workspace mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      path: string;
      is_default: boolean;
    }) => {
      const { data: result, error } = await client.POST("/api/workspaces", {
        body: data
      });
      if (error) {
        throw createErrorMessage(error, "Failed to create workspace");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setNewName("");
      setNewPath("");
      setIsDefault(false);
      setIsAdding(false);
      addNotification({
        type: "success",
        alert: true,
        content: "Workspace created successfully",
        dismissable: true
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: String(error),
        dismissable: true
      });
    }
  });

  // Update workspace mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      const { data: result, error } = await client.PUT(
        "/api/workspaces/{workspace_id}",
        {
          params: { path: { workspace_id: data.id } },
          body: { name: data.name }
        }
      );
      if (error) {
        throw createErrorMessage(error, "Failed to update workspace");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setEditingId(null);
      addNotification({
        type: "success",
        alert: true,
        content: "Workspace updated successfully",
        dismissable: true
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: String(error),
        dismissable: true
      });
    }
  });

  // Delete workspace mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.DELETE("/api/workspaces/{workspace_id}", {
        params: { path: { workspace_id: id } }
      });
      if (error) {
        throw createErrorMessage(error, "Failed to delete workspace");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      addNotification({
        type: "success",
        alert: true,
        content: "Workspace deleted successfully",
        dismissable: true
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: String(error),
        dismissable: true
      });
    }
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setNewName("");
      setNewPath("");
      setIsDefault(false);
      setIsAdding(false);
      setEditingId(null);
    }
  }, [open]);

  const handleCreate = useCallback(() => {
    if (!newName.trim() || !newPath.trim()) {
      addNotification({
        type: "error",
        alert: true,
        content: "Name and path are required",
        dismissable: true
      });
      return;
    }
    createMutation.mutate({
      name: newName.trim(),
      path: newPath.trim(),
      is_default: isDefault
    });
  }, [newName, newPath, isDefault, createMutation, addNotification]);

  const handleUpdate = useCallback(
    (id: string) => {
      if (!editName.trim()) {
        return;
      }
      updateMutation.mutate({ id, name: editName.trim() });
    },
    [editName, updateMutation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setWorkspaceToDelete(id);
      setDeleteConfirmOpen(true);
    },
    []
  );

  const handleConfirmDelete = useCallback(() => {
    if (workspaceToDelete) {
      deleteMutation.mutate(workspaceToDelete);
    }
    setDeleteConfirmOpen(false);
    setWorkspaceToDelete(null);
  }, [workspaceToDelete, deleteMutation]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setWorkspaceToDelete(null);
  }, []);

  const handleStartEdit = useCallback((workspace: WorkspaceResponse) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName("");
  }, []);

  const handleBrowse = useCallback(async () => {
    // Use native dialog if available (Electron context)
    if (hasNativeDialog() && window.api.dialog) {
      try {
        const result = await window.api.dialog.openFolder({
          title: "Select Workspace Folder"
        });
        if (!result.canceled && result.filePaths.length > 0) {
          setNewPath(result.filePaths[0]);
        }
      } catch {
        // Fall back to custom dialog if native fails
        setIsFileBrowserOpen(true);
      }
    } else {
      setIsFileBrowserOpen(true);
    }
  }, []);

  const handleFileBrowserConfirm = useCallback((path: string) => {
    setNewPath(path);
    setIsFileBrowserOpen(false);
  }, []);

  return (
    <>
      <Dialog
        css={styles(theme)}
        className="workspaces-manager-dialog"
        open={open}
        onClose={onClose}
        slotProps={{
          backdrop: {
            style: {
              backdropFilter: theme.vars.palette.glass.blur,
              backgroundColor: theme.vars.palette.glass.backgroundDialog
            }
          },
          paper: {
            style: {
              borderRadius: "16px",
              background: theme.vars.palette.background.paper,
              backdropFilter: `${theme.vars.palette.glass.blur} saturate(180%)`,
              border: `1px solid ${theme.vars.palette.divider}`
            }
          }
        }}
        sx={{
          "& .MuiDialog-paper": {
            width: "600px",
            maxWidth: "90vw",
            maxHeight: "80vh",
            margin: "auto",
            borderRadius: "16px",
            border: `1px solid ${theme.vars.palette.divider}`,
            background: "transparent",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
          }
        }}
      >
        <DialogTitle className="dialog-title">
          <PanelHeadline
            title="Workspaces Manager"
            actions={
              <Tooltip title="Close">
                <IconButton
                  aria-label="close"
                  onClick={onClose}
                  className="close-button"
                >
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            }
          />
        </DialogTitle>
        <DialogContent
          sx={{
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            padding: "0"
          }}
        >
          <div className="workspaces-manager">
            {isLoading ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  py: 4
                }}
              >
                <CircularProgress size={30} />
              </Box>
            ) : error ? (
              <Box className="empty-state">
                <Typography color="error" sx={{ mb: 1 }}>
                  Unable to load workspaces
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Check your connection and try again
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["workspaces"] })}
                >
                  Retry
                </Button>
              </Box>
            ) : workspaces && workspaces.length > 0 ? (
              <List className="workspace-list">
                {workspaces.map((workspace) => (
                  <ListItem key={workspace.id} className="workspace-item">
                    {editingId === workspace.id ? (
                      <div className="edit-form">
                        <TextField
                          size="small"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Workspace name"
                          autoFocus
                          fullWidth
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleUpdate(workspace.id);
                            }
                            if (e.key === "Escape") {
                              handleCancelEdit();
                            }
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => handleUpdate(workspace.id)}
                          color="primary"
                        >
                          <CheckIcon />
                        </IconButton>
                        <IconButton size="small" onClick={handleCancelEdit}>
                          <CancelIcon />
                        </IconButton>
                      </div>
                    ) : (
                      <>
                        <div className="workspace-item-content">
                          <FolderIcon className="workspace-icon" />
                          <ListItemText
                            className="workspace-info"
                            primary={
                              <Typography className="workspace-name">
                                {workspace.name}
                              </Typography>
                            }
                            secondary={
                              <>
                                <Typography
                                  component="span"
                                  className="workspace-path"
                                >
                                  {workspace.path}
                                </Typography>
                                <div className="workspace-badges">
                                  {workspace.is_default && (
                                    <Chip
                                      size="small"
                                      label="Default"
                                      color="primary"
                                      variant="outlined"
                                    />
                                  )}
                                  {!workspace.is_accessible && (
                                    <Chip
                                      size="small"
                                      label="Inaccessible"
                                      color="error"
                                      variant="outlined"
                                    />
                                  )}
                                </div>
                              </>
                            }
                          />
                        </div>
                        <ListItemSecondaryAction>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleStartEdit(workspace)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(workspace.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </>
                    )}
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box className="empty-state">
                <FolderIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography>No workspaces configured</Typography>
                <Typography variant="body2">
                  Add a workspace to allow agents to access local folders
                </Typography>
              </Box>
            )}

            {/* Add workspace section */}
            <div className="add-workspace-section">
              {isAdding ? (
                <div className="add-form">
                  <TextField
                    size="small"
                    label="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Workspace"
                    fullWidth
                    autoFocus
                  />
                  <div className="form-row">
                    <TextField
                      size="small"
                      label="Path"
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      placeholder="/path/to/folder"
                      fullWidth
                    />
                    <Button
                      className="browse-button"
                      variant="outlined"
                      onClick={handleBrowse}
                    >
                      Browse
                    </Button>
                  </div>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={isDefault}
                        onChange={(e) => setIsDefault(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Set as default workspace"
                  />
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 1,
                      mt: 1
                    }}
                  >
                    <Button
                      onClick={() => setIsAdding(false)}
                      color="inherit"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? "Adding..." : "Add Workspace"}
                    </Button>
                  </Box>
                </div>
              ) : (
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setIsAdding(true)}
                  fullWidth
                  variant="outlined"
                >
                  Add Workspace
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
        onConfirm={handleFileBrowserConfirm}
        title="Select Workspace Folder"
        initialPath="~"
        selectionMode="directory"
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete Workspace"
        content={
          <Typography>
            Are you sure you want to delete this workspace? This action cannot
            be undone.
          </Typography>
        }
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
};

export default memo(WorkspacesManager);
