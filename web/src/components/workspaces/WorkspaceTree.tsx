/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { isEqual } from "lodash";
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
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

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
    padding: "16px",
    overflow: "hidden",

    ".workspace-header": {
      marginBottom: "16px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },

    ".file-tree-container": {
      flex: 1,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "4px",
      padding: "8px",
      backgroundColor: theme.vars.palette.grey[900]
    },

    ".tree-actions": {
      display: "flex",
      gap: "8px",
      marginBottom: "8px"
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
  workspaceId: string,
  path: string = "."
): Promise<TreeViewItem[]> => {
  const { data, error } = await client.GET(
    "/api/files/workspaces/{workspace_id}/list",
    {
      params: {
        path: { workspace_id: workspaceId },
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
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemInTree(item.children, id);
      if (found) return found;
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

  const { getCurrentWorkflow } = useWorkflowManager((state) => ({
    getCurrentWorkflow: state.getCurrentWorkflow
  }));

  const currentWorkflow = getCurrentWorkflow();
  const workspaceId = currentWorkflow?.id;

  const {
    data: initialFiles,
    isLoading: isLoadingFiles,
    refetch: refetchFiles
  } = useQuery({
    queryKey: ["workspace-files", workspaceId],
    queryFn: () => fetchWorkspaceFiles(workspaceId!),
    enabled: Boolean(workspaceId)
  });

  // Update files when data loads
  if (initialFiles && !isEqual(initialFiles, files)) {
    setFiles(initialFiles);
  }

  const handleItemClick = useCallback(
    async (event: React.MouseEvent, itemId: string) => {
      if (!workspaceId) return;

      setSelectedFilePath(itemId);
      try {
        const targetItem = findItemInTree(files, itemId);
        if (shouldLoadChildren(targetItem)) {
          // Use itemId as the relative path
          const relativePath = itemId || ".";

          const children = await fetchWorkspaceFiles(workspaceId, relativePath);
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
    [files, workspaceId]
  );

  const handleDownload = useCallback(async () => {
    if (!selectedFilePath || !workspaceId) return;

    try {
      const url = `/api/files/workspaces/${workspaceId}/download/${selectedFilePath}`;
      window.open(url, "_blank");
    } catch (error) {
      log.error("Failed to download file:", error);
    }
  }, [selectedFilePath, workspaceId]);

  const handleRefresh = useCallback(() => {
    refetchFiles();
  }, [refetchFiles]);

  if (!workspaceId) {
    return (
      <Box css={workspaceTreeStyles(theme)}>
        <Typography variant="h6" className="workspace-header">
          Workspace Explorer
        </Typography>
        <Typography color="text.secondary">
          No workspace available. Run a workflow to create a workspace.
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

      {selectedFilePath && !selectedFilePath.includes("/loading") && (
        <div className="tree-actions">
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
          >
            Download
          </Button>
        </div>
      )}

      <div className="file-tree-container">
        {isLoadingFiles ? (
          <Typography>Loading files...</Typography>
        ) : files.length > 0 ? (
          <RichTreeView
            onItemClick={handleItemClick}
            items={files}
            aria-label="workspace file browser"
            selectedItems={selectedFilePath}
            sx={treeViewStyles(theme)}
          />
        ) : (
          <Typography color="text.secondary">No files in workspace</Typography>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkspaceTree, isEqual);
