/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import React, { useCallback, memo, useMemo } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useFolderPicker } from "./useFolderPicker";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import {
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  List,
  ListItem,
  ListItemSecondaryAction
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
      padding: 0
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
      gap: theme.spacing(1.5),
      minWidth: 0
    },
    ".workspace-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "var(--fontSizeBig)",
      flexShrink: 0
    },
    ".workspace-path": {
      flex: 1,
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontFamily: "monospace"
    },
    ".workspace-badges": {
      display: "flex",
      gap: theme.spacing(0.5),
      marginLeft: theme.spacing(1)
    },
    ".add-workspace-section": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      padding: theme.spacing(2),
      backgroundColor: theme.vars.palette.background.default
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(4),
      color: theme.vars.palette.text.secondary
    }
  });

// Fetch workspaces
const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

/** Derive a workspace name from an absolute folder path. */
function nameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const WorkspacesManager: React.FC = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { pickFolder, dialog: folderPickerDialog } = useFolderPicker();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = React.useState<
    string | null
  >(null);

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces
  });

  const handleRetry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; path: string }) => {
      return trpcClient.workspace.create.mutate({
        ...data,
        is_default: false
      });
    },
    onSuccess: (created) => {
      queryClient.setQueryData<WorkspaceResponse[]>(["workspaces"], (prev) => {
        if (prev?.some((w) => w.id === created.id)) return prev;
        return [...(prev ?? []), created as WorkspaceResponse];
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      addNotification({
        type: "success",
        alert: true,
        content: "Workspace added",
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

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; is_default: boolean }) => {
      return trpcClient.workspace.update.mutate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await trpcClient.workspace.delete.mutate({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      addNotification({
        type: "success",
        alert: true,
        content: "Workspace removed",
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

  const handleAddWorkspace = useCallback(async () => {
    const path = await pickFolder();
    if (!path) return;
    createMutation.mutate({ name: nameFromPath(path), path });
  }, [pickFolder, createMutation]);

  const handleDeleteWorkspace = useCallback((id: string) => {
    setWorkspaceToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

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
      if (workspace.is_default) return;
      updateMutation.mutate({ id: workspace.id, is_default: true });
    },
    [updateMutation]
  );

  return (
    <>
      <FlexColumn css={cssStyles} sx={{ flex: 1, minHeight: 0 }}>
        <div className="workspaces-manager">
          {isLoading ? (
            <FlexRow justify="center" align="center" sx={{ py: 4 }}>
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
              <EditorButton variant="outlined" onClick={handleRetry}>
                Retry
              </EditorButton>
            </Box>
          ) : workspaces && workspaces.length > 0 ? (
            <List className="workspace-list">
              {workspaces.map((workspace) => (
                <ListItem key={workspace.id} className="workspace-item">
                  <div className="workspace-item-content">
                    <FolderIcon className="workspace-icon" />
                    <Text className="workspace-path" title={workspace.path}>
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
                      onClick={() => handleToggleDefault(workspace)}
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
                      icon={<DeleteIcon fontSize="small" />}
                      tooltip="Remove"
                      onClick={() => handleDeleteWorkspace(workspace.id)}
                    />
                  </ListItemSecondaryAction>
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

          <div className="add-workspace-section">
            <EditorButton
              startIcon={<AddIcon />}
              onClick={handleAddWorkspace}
              fullWidth
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Adding…" : "Add Workspace"}
            </EditorButton>
          </div>
        </div>
      </FlexColumn>

      {folderPickerDialog}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Remove Workspace"
        content={
          <Text>
            Remove this workspace from NodeTool? The folder itself will not be
            deleted.
          </Text>
        }
        confirmText="Remove"
        cancelText="Cancel"
      />
    </>
  );
};

export default memo(WorkspacesManager);
