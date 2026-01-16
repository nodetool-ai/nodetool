/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import isEqual from "lodash/isEqual";
import { useQuery } from "@tanstack/react-query";
import log from "loglevel";
import { FileInfo } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip
} from "@mui/material";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SettingsIcon from "@mui/icons-material/Settings";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";
import WorkspaceSelect from "./WorkspaceSelect";

// Types
export interface TreeViewItem {
  id: string;
  label: string;
  className?: string;
  children?: TreeViewItem[];
  itemProps?: Record<string, any>;
  treeItemProps?: Record<string, any>;
  style?: Record<string, string>;
}

// Styles
const workspaceTreeStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "12px",
    overflow: "hidden",
    gap: "12px",

    ".workspace-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: "4px",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },

    ".workspace-header h6": {
      fontSize: "0.85rem",
      fontWeight: 600,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary
    },

    ".workspace-selector": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },

    ".settings-button": {
      color: theme.vars.palette.grey[400],
      transition: "color 0.2s ease",
      "&:hover": {
        color: theme.vars.palette.primary.main
      }
    },

    ".file-tree-container": {
      flex: 1,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "6px",
      padding: "8px",
      backgroundColor: theme.vars.palette.grey[900]
    },

    ".tree-actions": {
      display: "flex",
      gap: "8px"
    },

    ".open-folder-button": {
      textTransform: "none",
      fontSize: "0.75rem",
      borderColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
    }
  });

const treeViewStyles = (theme: Theme) => ({
  ".MuiTreeItem-content": {
    borderRadius: "2px",
    padding: "4px 8px",
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
    fontWeight: 300,
    fontSize: "0.875rem"
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
  workflowId: string,
  path: string = "."
): Promise<TreeViewItem[]> => {
  const { data, error } = await client.GET(
    "/api/workspaces/workflow/{workflow_id}/files",
    {
      params: {
        path: { workflow_id: workflowId },
        query: { path }
      }
    }
  );

  if (error) {
    throw createErrorMessage(error, "Failed to list workspace files");
  }

  return data.map((file: FileInfo) => fileToTreeItem(file));
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
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");

  const { getCurrentWorkflow, updateWorkflow, saveWorkflow } = useWorkflowManager((state) => ({
    getCurrentWorkflow: state.getCurrentWorkflow,
    updateWorkflow: state.updateWorkflow,
    saveWorkflow: state.saveWorkflow
  }));

  const setWorkspaceManagerOpen = useWorkspaceManagerStore(
    (state) => state.setIsOpen
  );

  const currentWorkflow = getCurrentWorkflow();
  const workflowId = currentWorkflow?.id;
  const workspaceId = currentWorkflow?.workspace_id;

  const {
    data: initialFiles,
    isLoading: isLoadingFiles,
    refetch: refetchFiles
  } = useQuery({
    queryKey: ["workflow-workspace-files", workflowId],
    queryFn: () => fetchWorkspaceFiles(workflowId!),
    enabled: Boolean(workflowId)
  });

  // Query for workspace is no longer needed since we use WorkspaceSelect

  const handleWorkspaceChange = useCallback(
    (newWorkspaceId: string | undefined) => {
      if (!currentWorkflow) { return; }
      const updatedWorkflow = {
        ...currentWorkflow,
        workspace_id: newWorkspaceId
      };
      updateWorkflow(updatedWorkflow);
      saveWorkflow(updatedWorkflow);
      // Refetch files after workspace change
      refetchFiles();
    },
    [currentWorkflow, updateWorkflow, saveWorkflow, refetchFiles]
  );

  // Update files when data loads
  if (initialFiles && !isEqual(initialFiles, files)) {
    setFiles(initialFiles);
  }

  const handleItemClick = useCallback(
    async (event: React.MouseEvent, itemId: string) => {
      if (!workflowId) { return; }

      setSelectedFilePath(itemId);
      try {
        const targetItem = findItemInTree(files, itemId);
        if (shouldLoadChildren(targetItem)) {
          const relativePath = itemId || ".";

          const children = await fetchWorkspaceFiles(workflowId, relativePath);
          setFiles((currentFiles) =>
            updateTreeWithChildren(currentFiles, itemId, children)
          );
        }
      } catch (error) {
        log.error("Failed to load children:", error);
        setFiles((currentFiles) =>
          updateTreeWithChildren(currentFiles, itemId, [createErrorItem(itemId)])
        );
      }
    },
    [files, workflowId]
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
    setWorkspaceManagerOpen(true);
  }, [setWorkspaceManagerOpen]);

  if (!workflowId) {
    return (
      <Box css={workspaceTreeStyles(theme)}>
        <Typography variant="h6" className="workspace-header">
          Workspace Explorer
        </Typography>
        <Typography color="text.secondary">
          No workflow selected. Open a workflow to access its workspace files.
        </Typography>
      </Box>
    );
  }

  return (
    <Box css={workspaceTreeStyles(theme)}>
      <div className="workspace-header">
        <Typography variant="h6">
          Workspace Explorer
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </div>

      {/* Workspace Selection */}
      <div className="workspace-selector">
        <WorkspaceSelect
          value={workspaceId ?? undefined}
          onChange={handleWorkspaceChange}
        />
        <Tooltip title="Manage Workspaces">
          <IconButton
            className="settings-button"
            size="small"
            onClick={handleManageWorkspace}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      {selectedFilePath && !selectedFilePath.includes("/loading") && (
        <div className="tree-actions">
          <Button
            className="open-folder-button"
            size="small"
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={handleOpenInFolder}
          >
            Open in Folder
          </Button>
        </div>
      )}

      <div className="file-tree-container">
        {isLoadingFiles ? (
          <Typography>Loading files...</Typography>
        ) : files.length > 0 ? (
          <div
            onDoubleClick={(e) => {
              // Find the closest tree item element to get the item ID
              const target = e.target as HTMLElement;
              const treeItem = target.closest('[data-testid="tree-item"]') as HTMLElement;
              if (treeItem) {
                const itemId = treeItem.getAttribute('data-itemid');
                if (itemId) {
                  handleItemDoubleClick(e, itemId);
                }
              }
            }}
          >
            <RichTreeView
              onItemClick={handleItemClick}
              items={files}
              aria-label="workspace file browser"
              selectedItems={selectedFilePath}
              sx={treeViewStyles(theme)}
              slotProps={{
                item: ({ itemId }) => ({
                  'data-testid': 'tree-item',
                  'data-itemid': itemId
                } as any)
              }}
            />
          </div>
        ) : (
          <Typography color="text.secondary">No files in workspace</Typography>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkspaceTree, isEqual);
