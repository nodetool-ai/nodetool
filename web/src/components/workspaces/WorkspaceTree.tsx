/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import isEqual from "lodash/isEqual";
import { useQuery } from "@tanstack/react-query";
import log from "loglevel";
import { FileInfo } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  Box,
  Typography,
  Button,
  Skeleton
} from "@mui/material";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ImageIcon from "@mui/icons-material/Image";
import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import DescriptionIcon from "@mui/icons-material/Description";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import TerminalIcon from "@mui/icons-material/Terminal";
import StorageIcon from "@mui/icons-material/Storage";
import AddIcon from "@mui/icons-material/Add";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { RefreshButton, SettingsButton } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";
import WorkspaceSelect from "./WorkspaceSelect";
import PanelHeadline from "../ui/PanelHeadline";

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
    },

    ".breadcrumb": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      padding: "4px 8px",
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "4px",
      overflow: "hidden",
      whiteSpace: "nowrap"
    },

    ".breadcrumb-segment": {
      cursor: "pointer",
      padding: "1px 4px",
      borderRadius: "3px",
      transition: "color 0.15s, background-color 0.15s",
      overflow: "hidden",
      textOverflow: "ellipsis",
      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },

    ".breadcrumb-separator": {
      color: theme.vars.palette.grey[600],
      fontSize: "14px",
      flexShrink: 0
    },

    ".empty-workspace": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      padding: "24px 16px",
      textAlign: "center"
    },

    ".skeleton-tree": {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "4px 0"
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

// File icon mapping
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico"
]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "swift",
  "kt",
  "vue",
  "svelte"
]);
const DATA_EXTENSIONS = new Set([
  "json",
  "yaml",
  "yml",
  "xml",
  "toml",
  "csv",
  "tsv"
]);
const DOC_EXTENSIONS = new Set([
  "md",
  "txt",
  "pdf",
  "doc",
  "docx",
  "rtf",
  "tex"
]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a"
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "avi",
  "mov",
  "mkv",
  "flv"
]);
const SCRIPT_EXTENSIONS = new Set(["sh", "bash", "zsh", "bat", "ps1", "cmd"]);
const DB_EXTENSIONS = new Set(["db", "sqlite", "sqlite3", "sql"]);

const getFileIcon = (fileName: string, isDir: boolean): React.ReactNode => {
  if (isDir) {
    return <FolderIcon sx={{ fontSize: 16, color: "primary.light" }} />;
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(ext)) {
    return <ImageIcon sx={{ fontSize: 16, color: "success.light" }} />;
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return <CodeIcon sx={{ fontSize: 16, color: "info.light" }} />;
  }
  if (DATA_EXTENSIONS.has(ext)) {
    return <DataObjectIcon sx={{ fontSize: 16, color: "warning.light" }} />;
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return <DescriptionIcon sx={{ fontSize: 16, color: "text.secondary" }} />;
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return <AudioFileIcon sx={{ fontSize: 16, color: "secondary.light" }} />;
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return <VideoFileIcon sx={{ fontSize: 16, color: "secondary.main" }} />;
  }
  if (SCRIPT_EXTENSIONS.has(ext)) {
    return <TerminalIcon sx={{ fontSize: 16, color: "warning.main" }} />;
  }
  if (DB_EXTENSIONS.has(ext)) {
    return <StorageIcon sx={{ fontSize: 16, color: "info.main" }} />;
  }
  return (
    <InsertDriveFileIcon sx={{ fontSize: 16, color: "text.secondary" }} />
  );
};

// Utils
const createErrorItem = (itemId: string): TreeViewItem => ({
  id: `${itemId}/error`,
  label: "⚠️ Access denied",
  children: undefined,
  className: "error-item"
});

const FileLabel: React.FC<{ name: string; isDir: boolean }> = ({
  name,
  isDir
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px"
    }}
  >
    {getFileIcon(name, isDir)}
    {name}
  </span>
);

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
  const params = new URLSearchParams({ path });
  const res = await fetch(
    `${BASE_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/files?${params}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to list workspace files (${res.status})`);
  }
  const data: FileInfo[] = await res.json();
  return data.map((file) => fileToTreeItem(file));
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
  const filesWorkspaceIdRef = useRef<string | undefined>();
  filesWorkspaceIdRef.current = filesWorkspaceId;
  const previousWorkflowId = useRef<string | null | undefined>(undefined);
  const {
    currentWorkflowId,
    openWorkflows,
    getCurrentWorkflow,
    updateWorkflow,
    saveWorkflow
  } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId,
    openWorkflows: state.openWorkflows,
    getCurrentWorkflow: state.getCurrentWorkflow,
    updateWorkflow: state.updateWorkflow,
    saveWorkflow: state.saveWorkflow
  }));

  const setWorkspaceManagerOpen = useWorkspaceManagerStore((state) => state.setIsOpen);

  const currentWorkflow = getCurrentWorkflow();
  const currentWorkflowMeta = openWorkflows.find(
    (workflow) => workflow.id === currentWorkflowId
  );
  const workflowId = currentWorkflowId ?? currentWorkflow?.id;
  const workspaceId = currentWorkflowMeta?.workspace_id ?? currentWorkflow?.workspace_id;

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
      if (!currentWorkflow) { return; }
      const updatedWorkflow = {
        ...currentWorkflow,
        workspace_id: newWorkspaceId
      };
      updateWorkflow(updatedWorkflow);
      try {
        await saveWorkflow(updatedWorkflow);
        setFilesWorkspaceId(newWorkspaceId);
      } catch (error) {
        log.error("Failed to save workspace change:", error);
      }
    },
    [currentWorkflow, updateWorkflow, saveWorkflow]
  );

  useEffect(() => {
    if (initialFiles && !isEqual(initialFiles, files)) {
      setFiles(initialFiles);
    }
  }, [files, initialFiles]);

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
        log.error("Failed to load children:", error);
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
    setWorkspaceManagerOpen(true);
  }, [setWorkspaceManagerOpen]);

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
          <Typography color="text.secondary" variant="body2">
            No workflow selected
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Open a workflow to access its workspace files
          </Typography>
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
            onClick={() => setSelectedFilePath("")}
          >
            ~
          </span>
          {breadcrumbSegments.map((segment, index) => (
            <span key={index} style={{ display: "contents" }}>
              <NavigateNextIcon className="breadcrumb-separator" />
              <span className="breadcrumb-segment">{segment}</span>
            </span>
          ))}
        </div>
      )}

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
        {!workspaceId ? (
          <div className="empty-workspace">
            <FolderOpenIcon
              sx={{ fontSize: 40, opacity: 0.3, color: "text.secondary" }}
            />
            <Typography color="text.secondary" variant="body2">
              No workspace selected
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Select a workspace above or create one
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleManageWorkspace}
              sx={{ mt: 1 }}
            >
              Create Workspace
            </Button>
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
              items={files as any}
              aria-label="workspace file browser"
              selectedItems={selectedFilePath}
              sx={treeViewStyles(theme)}
              slotProps={{
                item: ({ itemId }) =>
                  ({
                    "data-testid": "tree-item",
                    "data-itemid": itemId
                  }) as any
              }}
            />
          </div>
        ) : (
          <div className="empty-workspace">
            <FolderOpenIcon
              sx={{ fontSize: 36, opacity: 0.3, color: "text.secondary" }}
            />
            <Typography color="text.secondary" variant="body2">
              Workspace is empty
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Add files to your workspace folder to see them here
            </Typography>
          </div>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkspaceTree, isEqual);
