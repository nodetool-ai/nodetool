/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  DialogContent,
  DialogTitle,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  FormControlLabel,
  Checkbox
} from "@mui/material";
import React, { useCallback, useState, useEffect, memo } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import CheckIcon from "@mui/icons-material/Check";
import CancelIcon from "@mui/icons-material/Cancel";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { createErrorMessage } from "../../utils/errorHandling";
import { useNotificationStore } from "../../stores/NotificationStore";
import FileBrowserDialog from "../dialogs/FileBrowserDialog";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import PanelHeadline from "../ui/PanelHeadline";
import {
  Chip,
  CloseButton,
  Dialog,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  Text,
  TextInput,
  ToolbarIconButton
} from "../ui_primitives";

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
  const { data, error } = await client.GET("/api/workspaces/", {
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

  // Memoized handlers
  const handleRetry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }, [queryClient]);

  const handleDeleteWorkspace = useCallback((id: string) => {
    setWorkspaceToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

  const createDeleteWorkspaceHandler = useCallback((id: string) => {
    return () => handleDeleteWorkspace(id);
  }, [handleDeleteWorkspace]);

  const handleAddWorkspace = useCallback(() => {
    setIsAdding(true);
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewName("");
    setNewPath("");
    setIsDefault(false);
  }, []);

  // Create workspace mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      path: string;
      is_default: boolean;
    }) => {
      const { data: result, error } = await client.POST("/api/workspaces/", {
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
    mutationFn: async (data: {
      id: string;
      name?: string;
      is_default?: boolean;
    }) => {
      const body: { name?: string; is_default?: boolean } = {};
      if (data.name !== undefined) {
        body.name = data.name;
      }
      if (data.is_default !== undefined) {
        body.is_default = data.is_default;
      }
      const { data: result, error } = await client.PUT(
        "/api/workspaces/{workspace_id}",
        {
          params: { path: { workspace_id: data.id } },
          body
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

  const createUpdateHandler = useCallback((id: string) => {
    return () => handleUpdate(id);
  }, [handleUpdate]);

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

  const handleToggleDefault = useCallback(
    (workspace: WorkspaceResponse) => {
      if (workspace.is_default) {
        return; // Already default, don't un-default
      }
      updateMutation.mutate({ id: workspace.id, is_default: true });
    },
    [updateMutation]
  );

  const createToggleDefaultHandler = useCallback(
    (workspace: WorkspaceResponse) => {
      return () => handleToggleDefault(workspace);
    },
    [handleToggleDefault]
  );

  const handleStartEdit = useCallback((workspace: WorkspaceResponse) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
  }, []);

  const createStartEditHandler = useCallback((workspace: WorkspaceResponse) => {
    return () => handleStartEdit(workspace);
  }, [handleStartEdit]);

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

  // Memoized handlers for form inputs to prevent re-renders
  const handleNewNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value);
  }, []);

  const handleNewPathChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPath(e.target.value);
  }, []);

  const handleIsDefaultChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDefault(e.target.checked);
  }, []);

  const handleEditNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditName(e.target.value);
  }, []);

  return (
    <>
      <Dialog
        css={styles(theme)}
        className="workspaces-manager-dialog"
        open={open}
        onClose={onClose}
        minWidth={600}
      >
        <DialogTitle className="dialog-title">
          <PanelHeadline
            title="Workspaces Manager"
            actions={
              <CloseButton
                onClick={onClose}
                tooltip="Close"
                className="close-button"
              />
            }
          />
        </DialogTitle>
        <DialogContent>
          <div className="workspaces-manager">
            {isLoading ? (
              <FlexRow
                justify="center"
                align="center"
                sx={{ py: 4 }}
              >
                <LoadingSpinner size={30} />
              </FlexRow>
            ) : error ? (
              <Box className="empty-state">
                <Text color="error" sx={{ mb: 1 }}>
                  Unable to load workspaces
                </Text>
                <Text size="small" color="secondary" sx={{ mb: 2 }}>
                  Check your connection and try again
                </Text>
                <EditorButton
                  variant="outlined"
                  onClick={handleRetry}
                >
                  Retry
                </EditorButton>
              </Box>
            ) : workspaces && workspaces.length > 0 ? (
              <List className="workspace-list">
                {workspaces.map((workspace) => (
                  <ListItem key={workspace.id} className="workspace-item">
                    {editingId === workspace.id ? (
                      <div className="edit-form">
                        <TextInput
                          size="small"
                          value={editName}
                          onChange={handleEditNameChange}
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
                        <ToolbarIconButton
                          icon={<CheckIcon />}
                          tooltip="Save changes"
                          onClick={createUpdateHandler(workspace.id)}
                          variant="primary"
                        />
                        <ToolbarIconButton
                          icon={<CancelIcon />}
                          tooltip="Cancel"
                          onClick={handleCancelEdit}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="workspace-item-content">
                          <FolderIcon className="workspace-icon" />
                          <ListItemText
                            className="workspace-info"
                            primary={
                              <Text className="workspace-name">
                                {workspace.name}
                              </Text>
                            }
                            secondaryTypographyProps={{ component: 'div' }}
                            secondary={
                              <>
                                <Text
                                  component="span"
                                  className="workspace-path"
                                >
                                  {workspace.path}
                                </Text>
                                <span className="workspace-badges">
                                  {!workspace.is_accessible && (
                                    <Chip
                                      size="small"
                                      label="Inaccessible"
                                      color="error"
                                      variant="outlined"
                                    />
                                  )}
                                </span>
                              </>
                            }
                          />
                        </div>
                        <ListItemSecondaryAction>
                          <ToolbarIconButton
                            icon={
                              workspace.is_default ? (
                                <StarIcon fontSize="small" />
                              ) : (
                                <StarBorderIcon fontSize="small" />
                              )
                            }
                            tooltip={
                              workspace.is_default
                                ? "Default workspace"
                                : "Set as default"
                            }
                            onClick={createToggleDefaultHandler(workspace)}
                            sx={{
                              color: workspace.is_default
                                ? "warning.main"
                                : "text.secondary",
                              "&:hover": {
                                color: "warning.main"
                              }
                            }}
                          />
                          <ToolbarIconButton
                            icon={<EditIcon fontSize="small" />}
                            tooltip="Edit"
                            onClick={createStartEditHandler(workspace)}
                          />
                          <ToolbarIconButton
                            icon={<DeleteIcon fontSize="small" />}
                            tooltip="Delete"
                            onClick={createDeleteWorkspaceHandler(workspace.id)}
                          />
                        </ListItemSecondaryAction>
                      </>
                    )}
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box className="empty-state">
                <FolderIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Text>No workspaces configured</Text>
                <Text size="small">
                  Add a workspace to allow agents to access local folders
                </Text>
              </Box>
            )}

            {/* Add workspace section */}
            <div className="add-workspace-section">
              {isAdding ? (
                <div className="add-form">
                  <TextInput
                    size="small"
                    label="Name"
                    value={newName}
                    onChange={handleNewNameChange}
                    placeholder="My Workspace"
                    fullWidth
                    autoFocus
                  />
                  <div className="form-row">
                    <TextInput
                      size="small"
                      label="Path"
                      value={newPath}
                      onChange={handleNewPathChange}
                      placeholder="/path/to/folder"
                      fullWidth
                    />
                    <EditorButton
                      className="browse-button"
                      variant="outlined"
                      onClick={handleBrowse}
                    >
                      Browse
                    </EditorButton>
                  </div>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={isDefault}
                        onChange={handleIsDefaultChange}
                        size="small"
                      />
                    }
                    label="Set as default workspace"
                  />
                  <FlexRow
                    justify="flex-end"
                    gap={1}
                    sx={{ mt: 1 }}
                  >
                    <EditorButton
                      onClick={handleCancelAdd}
                      color="inherit"
                    >
                      Cancel
                    </EditorButton>
                    <EditorButton
                      variant="contained"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? "Adding..." : "Add Workspace"}
                    </EditorButton>
                  </FlexRow>
                </div>
              ) : (
                <EditorButton
                  startIcon={<AddIcon />}
                  onClick={handleAddWorkspace}
                  fullWidth
                >
                  Add Workspace
                </EditorButton>
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
          <Text>
            Are you sure you want to delete this workspace? This action cannot
            be undone.
          </Text>
        }
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
};

export default memo(WorkspacesManager);
