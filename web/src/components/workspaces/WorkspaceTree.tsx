/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import isEqual from "../../utils/isEqual";
import { useQuery } from "@tanstack/react-query";
import { FileInfo } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import { Text, Caption, Box, EditorButton, Skeleton, BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../ui_primitives";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import type { TreeViewBaseItem } from "@mui/x-tree-view/models";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { RefreshButton, SettingsButton } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";
import WorkspaceSelect from "./WorkspaceSelect";
import PanelHeadline from "../ui/PanelHeadline";

// Types
export interface TreeViewItem {
  id: string;
  label: string;
  className?: string;
  children?: TreeViewItem[];
  itemProps?: Record<string, unknown>;
  treeItemProps?: Record<string, unknown>;
  style?: Record<string, string>;
}

// Styles
const workspaceTreeStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: getSpacingPx(SPACING.lg),
    overflow: "hidden",
    gap: getSpacingPx(SPACING.lg),

    ".workspace-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: getSpacingPx(SPACING.xs),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },

    ".workspace-header h6": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary
    },

    ".workspace-selector": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md)
    },

    ".settings-button": {
      color: theme.vars.palette.grey[400],
      transition: `color ${MOTION.normal}`,
      "&:hover": {
        color: theme.vars.palette.primary.main
      }
    },

    ".file-tree-container": {
      flex: 1,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: BORDER_RADIUS.md,
      padding: getSpacingPx(SPACING.md),
      backgroundColor: theme.vars.palette.grey[900]
    },

    ".tree-actions": {
      display: "flex",
      gap: getSpacingPx(SPACING.md)
    },

    ".open-folder-button": {
      textTransform: "none",
      fontSize: "var(--fontSizeSmall)",
      borderColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
    },

    ".breadcrumb": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.micro),
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      whiteSpace: "nowrap"
    },

    ".breadcrumb-segment": {
      cursor: "pointer",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`, // was 1px 4px
      borderRadius: BORDER_RADIUS.sm,
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      overflow: "hidden",
      textOverflow: "ellipsis",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },

    ".breadcrumb-separator": {
      color: theme.vars.palette.grey[600],
      fontSize: "var(--fontSizeNormal)",
      flexShrink: 0
    },

    ".empty-workspace": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.xxl)} ${getSpacingPx(SPACING.xl)}`,
      textAlign: "center"
    },

    ".skeleton-tree": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm),
      padding: `${getSpacingPx(SPACING.xs)} 0`
    }
  });

const treeViewStyles = (theme: Theme) => ({
  ".MuiTreeItem-content": {
    borderRadius: BORDER_RADIUS.xs,
    padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
    userSelect: "none",
    cursor: "pointer"
  },
  ".MuiTreeItem-content.Mui-selected": {
    backgroundColor: `${theme.vars.palette.primary.main}44 !important`,
    color: theme.vars.palette.primary.light
  },
  ".MuiTreeItem-content:hover": {
    backgroundColor: `${theme.vars.palette.grey[700]}66 !important`
  },
  ".MuiTreeItem-content.Mui-selected:hover": {
    backgroundColor: `${theme.vars.palette.primary.main}66 !important`
  },
  ".MuiTreeItem-label": {
    backgroundColor: "transparent !important",
    fontWeight: 400,
    fontSize: "var(--fontSizeNormal)"
  },
  ".MuiTreeItem-content:has(.MuiTreeItem-iconContainer svg) .MuiTreeItem-label":
  {
    fontWeight: 600
  },
  ".folder-item .MuiTreeItem-label": {
    color: theme.vars.palette.info.light
  },
  ".file-item .MuiTreeItem-label": {
    color: theme.vars.palette.grey[200]
  },
  "[id$='/error'] .MuiTreeItem-content": {
    color: theme.vars.palette.warning.main
  },
  ".loading-item .MuiTreeItem-label": {
    color: theme.vars.palette.grey[500],
    fontStyle: "italic"
  }
});

// Utils
const createErrorItem = (itemId: string): TreeViewItem => ({
  id: `${itemId}/error`,
  label: "⚠️ Access denied",
  children: undefined,
  className: "error-item"
});

const fileToTreeItem = (file: FileInfo): TreeViewItem => {
  const item: TreeViewItem = {
    id: file.path,
    label: file.name,
    treeItemProps: {
      className: file.is_dir ? "folder-item" : "file-item"
    }
  };

  if (file.is_dir) {
    item.children = [
      {
        id: file.path + "/loading",
        label: "loading...",
        className: "loading-item",
        children: []
      }
    ];
  }

  return item;
};

const fetchWorkspaceFiles = async (
  workspaceId: string,
  path: string = "."
): Promise<TreeViewItem[]> => {
  const data = await trpcClient.workspace.listFiles.query({
    id: workspaceId,
    path
  });
  return (data as FileInfo[]).map((file) => fileToTreeItem(file));
};


// Helper function to find item in tree
const findItemInTree = (
  items: TreeViewItem[],
  id: string
): TreeViewItem | undefined => {
  for (const item of items) {
    if (item.id === id) { return item; }
    if (item.children) {
      const found = findItemInTree(item.children, id);
      if (found) { return found; }
    }
  }
  return undefined;
};

// Pure function to update tree with children
const updateTreeWithChildren = (
  items: TreeViewItem[],
  itemId: string,
  children: TreeViewItem[]
): TreeViewItem[] => {
  return items.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        children
      };
    }
    if (item.children) {
      return {
        ...item,
        children: updateTreeWithChildren(item.children, itemId, children)
      };
    }
    return item;
  });
};

// Pure function to check if item needs children loaded
const shouldLoadChildren = (item: TreeViewItem | undefined): boolean => {
  return Boolean(
    item?.children?.length === 1 && item.children[0].label === "loading..."
  );
};

const WorkspaceTree: React.FC = () => {
  const theme = useTheme();
  const [files, setFiles] = useState<TreeViewItem[]>([]);
  const filesRef = useRef<TreeViewItem[]>([]);
  filesRef.current = files;
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [filesWorkspaceId, setFilesWorkspaceId] = useState<string | undefined>();
  const filesWorkspaceIdRef = useRef<string | undefined>(undefined);
  filesWorkspaceIdRef.current = filesWorkspaceId;
  const previousWorkflowId = useRef<string | null | undefined>(undefined);
  const { currentWorkflowId, getCurrentWorkflow } = useWorkflowManager(
    useShallow((state) => ({
      currentWorkflowId: state.currentWorkflowId,
      getCurrentWorkflow: state.getCurrentWorkflow
    }))
  );

  const navigate = useNavigate();

  const currentWorkflow = getCurrentWorkflow();
  const workflowId = currentWorkflowId ?? currentWorkflow?.id;
  const { workspaceId, setWorkspaceId } = useCurrentWorkspace();

  const {
    data: initialFiles,
    isLoading: isLoadingFiles,
    refetch: refetchFiles
  } = useQuery({
    queryKey: ["workspace-files", filesWorkspaceId],
    queryFn: () => fetchWorkspaceFiles(filesWorkspaceId!),
    enabled: Boolean(filesWorkspaceId)
  });

  // Query for workspace is no longer needed since we use WorkspaceSelect

  const handleWorkspaceChange = useCallback(
    async (newWorkspaceId: string | undefined) => {
      await setWorkspaceId(newWorkspaceId);
      setFilesWorkspaceId(newWorkspaceId);
    },
    [setWorkspaceId]
  );

  useEffect(() => {
    if (initialFiles) {
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  useEffect(() => {
    setSelectedFilePath("");
    setFiles([]);
  }, [filesWorkspaceId, workflowId]);

  useEffect(() => {
    if (workflowId !== previousWorkflowId.current) {
      previousWorkflowId.current = workflowId;
      setFilesWorkspaceId(workspaceId ?? undefined);
      return;
    }
    if (filesWorkspaceId === undefined && workspaceId) {
      setFilesWorkspaceId(workspaceId);
    }
  }, [filesWorkspaceId, workflowId, workspaceId]);

  const loadItemChildren = useCallback(
    async (itemId: string) => {
      const wsId = filesWorkspaceIdRef.current;
      if (!wsId) return;

      const currentFiles = filesRef.current;
      const targetItem = findItemInTree(currentFiles, itemId);
      if (!shouldLoadChildren(targetItem)) return;

      try {
        const children = await fetchWorkspaceFiles(wsId, itemId || ".");
        setFiles((prev) => updateTreeWithChildren(prev, itemId, children));
      } catch (error) {
        console.error("Failed to load children:", error);
        setFiles((prev) => updateTreeWithChildren(prev, itemId, [createErrorItem(itemId)]));
      }
    },
    []
  );

  const handleItemClick = useCallback(
    async (_event: React.MouseEvent, itemId: string) => {
      setSelectedFilePath(itemId);
      await loadItemChildren(itemId);
    },
    [loadItemChildren]
  );

  const handleItemDoubleClick = useCallback(
    async (event: React.MouseEvent, itemId: string) => {
      // Open file or folder via Electron API
      if (window.api?.shell?.openPath) {
        await window.api.shell.openPath(itemId);
      }
    },
    []
  );

  const handleOpenInFolder = useCallback(async () => {
    if (!selectedFilePath) { return; }

    if (window.api?.shell?.showItemInFolder) {
      await window.api.shell.showItemInFolder(selectedFilePath);
    }
  }, [selectedFilePath]);

  const handleRefresh = useCallback(() => {
    refetchFiles();
  }, [refetchFiles]);

  const handleManageWorkspace = useCallback(() => {
    navigate("/settings?tab=5");
  }, [navigate]);

  // Handle double-click on tree container to find the specific tree item
  const handleTreeDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Find the closest tree item element to get the item ID
    const target = e.target as HTMLElement;
    const treeItem = target.closest('[data-testid="tree-item"]') as HTMLElement;
    if (treeItem) {
      const itemId = treeItem.getAttribute('data-itemid');
      if (itemId) {
        handleItemDoubleClick(e, itemId);
      }
    }
  }, [handleItemDoubleClick]);

  // Build breadcrumb segments from selected path
  const breadcrumbSegments =
    selectedFilePath && !selectedFilePath.includes("/loading")
      ? selectedFilePath.split("/").filter(Boolean)
      : [];

  if (!workflowId) {
    return (
      <Box css={workspaceTreeStyles(theme)}>
        <PanelHeadline title="Workspace Explorer" />
        <div className="empty-workspace">
          <FolderOpenIcon
            sx={{ fontSize: 40, opacity: 0.3, color: "text.secondary" }}
          />
          <Text size="small" color="secondary">
            No workflow selected
          </Text>
          <Caption color="secondary">
            Open a workflow to access its workspace files
          </Caption>
        </div>
      </Box>
    );
  }

  return (
    <Box css={workspaceTreeStyles(theme)}>
      <PanelHeadline
        title="Workspace Explorer"
        actions={
          <RefreshButton
            onClick={handleRefresh}
            tooltip="Refresh"
            tooltipPlacement="bottom"
          />
        }
      />

      {/* Workspace Selection */}
      <div className="workspace-selector">
        <WorkspaceSelect
          value={workspaceId ?? undefined}
          onChange={handleWorkspaceChange}
        />
        <SettingsButton
          className="settings-button"
          onClick={handleManageWorkspace}
          tooltip="Manage Workspaces"
        />
      </div>

      {/* Breadcrumb navigation */}
      {breadcrumbSegments.length > 0 && (
        <div className="breadcrumb">
          <span
            className="breadcrumb-segment"
            role="button"
            tabIndex={0}
            onClick={() => setSelectedFilePath("")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedFilePath(""); } }}
          >
            ~
          </span>
          {breadcrumbSegments.map((segment, index) => (
            <span key={`${index}-${segment}`} style={{ display: "contents" }}>
              <NavigateNextIcon className="breadcrumb-separator" />
              <span className="breadcrumb-segment">{segment}</span>
            </span>
          ))}
        </div>
      )}

      {selectedFilePath && !selectedFilePath.includes("/loading") && (
        <div className="tree-actions">
          <EditorButton
            className="open-folder-button"
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={handleOpenInFolder}
          >
            Open in Folder
          </EditorButton>
        </div>
      )}

      <div className="file-tree-container">
        {!workspaceId ? (
          <div className="empty-workspace">
            <FolderOpenIcon
              sx={{ fontSize: 40, opacity: 0.3, color: "text.secondary" }}
            />
            <Text size="small" color="secondary">
              No workspace selected
            </Text>
            <Caption color="secondary">
              Select a workspace above or create one
            </Caption>
            <EditorButton
              startIcon={<AddIcon />}
              onClick={handleManageWorkspace}
              sx={{ mt: 1 }}
            >
              Create Workspace
            </EditorButton>
          </div>
        ) : isLoadingFiles ? (
          <div className="skeleton-tree">
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="45%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="70%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="50%" height={24} />
            <Skeleton variant="text" width="55%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="40%" height={24} />
          </div>
        ) : files.length > 0 ? (
          <div onDoubleClick={handleTreeDoubleClick}>
            <RichTreeView
              onItemClick={handleItemClick}
              onExpandedItemsChange={(_event: React.SyntheticEvent, itemIds: string[]) => {
                for (const itemId of itemIds) {
                  loadItemChildren(itemId);
                }
              }}
              items={files as TreeViewBaseItem[]}
              aria-label="workspace file browser"
              selectedItems={selectedFilePath}
              sx={treeViewStyles(theme)}
              slotProps={{
                item: ({ itemId }) =>
                  ({
                    "data-testid": "tree-item",
                    "data-itemid": itemId
                  }) as Record<string, string>
              }}
            />
          </div>
        ) : (
          <div className="empty-workspace">
            <FolderOpenIcon
              sx={{ fontSize: 36, opacity: 0.3, color: "text.secondary" }}
            />
            <Text size="small" color="secondary">
              Workspace is empty
            </Text>
            <Caption color="secondary">
              Add files to your workspace folder to see them here
            </Caption>
          </div>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkspaceTree, isEqual);
