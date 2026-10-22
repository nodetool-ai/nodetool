/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import React, { useCallback, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/AddOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import { WorkspaceResponse } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useWorkspaces,
  useWorkspaceCacheWriter,
  WORKSPACES_QUERY_KEY
} from "../../hooks/useWorkspaces";
import { useFolderPicker } from "./useFolderPicker";
import ErrorBanner from "../support/ErrorBanner";
import { ConfirmDialog, EmptyState } from "../ui_primitives";
import {
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
      fontFamily: "var(--fontFamily2)"
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

/** Derive a workspace name from an absolute folder path. */
function nameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

const WorkspacesManager: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const writeWorkspaceToCache = useWorkspaceCacheWriter();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { pickFolder, dialog: folderPickerDialog } = useFolderPicker();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = React.useState<
    string | null
  >(null);

  const { workspaces, canManage, isLoading, error } = useWorkspaces();

  const handleRetry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; path: string }) => {
      return trpcClient.workspace.create.mutate({
        ...data,
        is_default: false
      });
    },
    onSuccess: (created) => {
      writeWorkspaceToCache(created as WorkspaceResponse);
      addNotification({
        type: "success",
        alert: true,
        content: t("batch2_1.notifications.added"),
        dismissable: true
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("batch2_1.errors.operation", { error: String(error) }),
        dismissable: true
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; is_default: boolean }) => {
      return trpcClient.workspace.update.mutate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("batch2_1.errors.operation", { error: String(error) }),
        dismissable: true
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await trpcClient.workspace.delete.mutate({ id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
      addNotification({
        type: "success",
        alert: true,
        content: t("batch2_1.notifications.removed"),
        dismissable: true
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("batch2_1.errors.operation", { error: String(error) }),
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
              <LoadingSpinner size="medium" />
            </FlexRow>
          ) : error ? (
            <ErrorBanner
              title={t("batch2_1.errors.loadTitle")}
              onRetry={handleRetry}
              report={{
                source: "operation-failure",
                summary: t("batch2_1.errors.loadSummary"),
                errorText: error instanceof Error ? error.message : String(error)
              }}
            >
              {t("batch2_1.errors.loadDescription")}
            </ErrorBanner>
          ) : workspaces.length > 0 ? (
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
                          label={t("batch2_1.manager.inaccessible")}
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
                          ? t("batch2_1.manager.defaultWorkspace")
                          : t("batch2_1.manager.setDefault")
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
                    {!workspace.is_default && (
                      <ToolbarIconButton
                        icon={<DeleteIcon fontSize="small" />}
                        tooltip={t("batch2_1.common.remove")}
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                      />
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          ) : (
            <EmptyState
              icon={<FolderIcon />}
              title={t("batch2_1.manager.emptyTitle")}
              description={
                canManage
                  ? t("batch2_1.manager.emptyCanManage")
                  : t("batch2_1.manager.emptyManaged")
              }
            />
          )}

          {canManage && (
            <div className="add-workspace-section">
              <EditorButton
                startIcon={<AddIcon />}
                onClick={handleAddWorkspace}
                fullWidth
                loading={createMutation.isPending}
              >
                {createMutation.isPending ? t("batch2_1.manager.adding") : t("batch2_1.manager.addWorkspace")}
              </EditorButton>
            </div>
          )}
        </div>
      </FlexColumn>

      {folderPickerDialog}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t("batch2_1.manager.removeTitle")}
        content={
          <Text>
            {t("batch2_1.manager.removeDescription")}
          </Text>
        }
        confirmText={t("batch2_1.common.remove")}
        cancelText={t("batch2_1.common.cancel")}
      />
    </>
  );
};

export default memo(WorkspacesManager);
