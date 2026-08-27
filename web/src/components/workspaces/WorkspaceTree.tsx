/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import isEqual from "../../utils/isEqual";
import { useQuery } from "@tanstack/react-query";
import { FileInfo } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import { Text, Caption, Box, EditorButton, Skeleton, BORDER_RADIUS, MOTION, SPACING, getSpacingPx } from "../ui_primitives";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { RefreshButton, SettingsButton } from "../ui_primitives";
import { openPageTab } from "../workspace/openPageTab";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useWorkspaceExplorer } from "../../hooks/useWorkspaceExplorer";
import WorkspaceSelect from "./WorkspaceSelect";
import PanelHeadline from "../ui/PanelHeadline";

/** Props forwarded onto a rendered tree row. */
interface TreeViewItemSlotProps {
  className?: string;
}

interface TreeViewItem {
  id: string;
  label: string;
  className?: string;
  children?: TreeViewItem[];
  itemProps?: TreeViewItemSlotProps;
  treeItemProps?: TreeViewItemSlotProps;
  style?: Record<string, string>;
}

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
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.xs)}`,
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
  return data.map((file) => fileToTreeItem(file));
};

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

/** How deep a workspace path sits, so parents can be merged before children. */
const depthOf = (path: string): number => path.split("/").length;

const shouldLoadChildren = (item: TreeViewItem | undefined): boolean => {
  return Boolean(
    item?.children?.length === 1 && item.children[0].label === "loading..."
  );
};

/**
 * Browser for the files in a workspace folder.
 *
 * Independent of the graph editor: it shows whichever workspace the user
 * picked here, works with no workflow open, and changing that pick moves only
 * this tree — a workflow keeps whatever workspace its runs write to.
 */
const WorkspaceTree: React.FC = () => {
  const theme = useTheme();
  const [files, setFiles] = useState<TreeViewItem[]>([]);
  const filesRef = useRef<TreeViewItem[]>([]);
  filesRef.current = files;
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedItemsRef = useRef<string[]>([]);
  expandedItemsRef.current = expandedItems;

  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const {
    workspaceId,
    setWorkspaceId,
    isLoading: isLoadingWorkspaces
  } = useWorkspaceExplorer();
  const workspaceIdRef = useRef<string | undefined>(workspaceId);
  workspaceIdRef.current = workspaceId;

  const {
    data: initialFiles,
    dataUpdatedAt,
    isLoading: isLoadingFiles,
    refetch: refetchFiles
  } = useQuery({
    queryKey: ["workspace-files", workspaceId],
    queryFn: () => fetchWorkspaceFiles(workspaceId!),
    enabled: Boolean(workspaceId)
  });

  // The query answers with the root listing; lazily-loaded children are merged
  // into this copy as folders expand.
  //
  // A refetch replaces the whole tree, which puts a `loading...` placeholder
  // back under every folder that was open — and nothing would ever replace it,
  // because MUI keeps its expansion state and so fires no expand event. The
  // open folders are therefore re-listed here, which is also what makes a file
  // written into a subfolder appear without collapsing the tree by hand.
  useEffect(() => {
    setFiles(initialFiles ?? []);

    const wsId = workspaceId;
    const expanded = expandedItemsRef.current;
    if (!wsId || !initialFiles || expanded.length === 0) return;

    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        expanded.map(async (itemId) => ({
          itemId,
          children: await fetchWorkspaceFiles(wsId, itemId).catch(() => [
            createErrorItem(itemId)
          ])
        }))
      );
      if (cancelled) return;
      // Shallowest first: a child's listing is merged into a parent that has
      // already been replaced, not into the placeholder it is about to lose.
      loaded.sort((a, b) => depthOf(a.itemId) - depthOf(b.itemId));
      setFiles((prev) =>
        loaded.reduce(
          (tree, { itemId, children }) =>
            updateTreeWithChildren(tree, itemId, children),
          prev
        )
      );
    })();
    return () => {
      cancelled = true;
    };
    // `dataUpdatedAt`, not just `initialFiles`: TanStack's structural sharing
    // hands back the identical array when a refetch finds the root unchanged,
    // and a file written into an open subfolder changes nothing at the root.
    // Keying on the data alone made that refresh a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles, dataUpdatedAt, workspaceId]);

  useEffect(() => {
    setSelectedFilePath("");
    setExpandedItems([]);
  }, [workspaceId]);

  const loadItemChildren = useCallback(
    async (itemId: string) => {
      const wsId = workspaceIdRef.current;
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

  // Double-click opens the file as a workspace tab. Handing it to the OS is a
  // secondary action on the selected file ("Open Externally"), Electron only.
  const handleItemDoubleClick = useCallback(
    async (_event: React.MouseEvent, itemId: string) => {
      const wsId = workspaceIdRef.current;
      if (!wsId || itemId.endsWith("/loading") || itemId.endsWith("/error")) {
        return;
      }
      const item = findItemInTree(filesRef.current, itemId);
      if (item?.treeItemProps?.className === "folder-item") {
        await loadItemChildren(itemId);
        return;
      }
      openTab({
        type: "workspace-file",
        ref: `${wsId}::${itemId}`,
        mode: "view",
        title: item?.label ?? itemId.split("/").pop() ?? itemId
      });
    },
    [loadItemChildren, openTab]
  );

  const handleOpenExternally = useCallback(async () => {
    if (!selectedFilePath) { return; }
    if (window.api?.shell?.openPath) {
      await window.api.shell.openPath(selectedFilePath);
    }
  }, [selectedFilePath]);

  const handleOpenInFolder = useCallback(async () => {
    if (!selectedFilePath) { return; }

    if (window.api?.shell?.showItemInFolder) {
      await window.api.shell.showItemInFolder(selectedFilePath);
    }
  }, [selectedFilePath]);

  const handleRefresh = useCallback(() => {
    refetchFiles();
  }, [refetchFiles]);

  // Workspaces left the settings page — they are their own workspace tab now.
  const handleManageWorkspace = useCallback(() => {
    openPageTab("workspaces");
  }, []);

  const handleTreeDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const treeItem = target.closest('[data-testid="tree-item"]') as HTMLElement;
    if (treeItem) {
      const itemId = treeItem.getAttribute('data-itemid');
      if (itemId) {
        handleItemDoubleClick(e, itemId);
      }
    }
  }, [handleItemDoubleClick]);

  const breadcrumbSegments =
    selectedFilePath && !selectedFilePath.includes("/loading")
      ? selectedFilePath.split("/").filter(Boolean)
      : [];

  return (
    <Box css={workspaceTreeStyles(theme)}>
      <PanelHeadline
        title="Workspace Explorer"
        docsTopic="workspaces"
        actions={
          <RefreshButton
            onClick={handleRefresh}
            tooltip="Refresh"
            tooltipPlacement="bottom"
          />
        }
      />

      <div className="workspace-selector">
        <WorkspaceSelect
          value={workspaceId}
          onChange={setWorkspaceId}
        />
        <SettingsButton
          className="settings-button"
          onClick={handleManageWorkspace}
          tooltip="Manage Workspaces"
        />
      </div>

      {breadcrumbSegments.length > 0 && (
        <div className="breadcrumb">
          <span
            className="breadcrumb-segment"
            role="button"
            aria-label="Go to workspace root"
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
          {Boolean(window.api?.shell?.openPath) && (
            <EditorButton
              className="open-folder-button"
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={handleOpenExternally}
            >
              Open Externally
            </EditorButton>
          )}
        </div>
      )}

      <div className="file-tree-container">
        {isLoadingWorkspaces || isLoadingFiles ? (
          <div className="skeleton-tree">
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="45%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="70%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="50%" height={24} />
            <Skeleton variant="text" width="55%" height={24} sx={{ ml: 2 }} />
            <Skeleton variant="text" width="40%" height={24} />
          </div>
        ) : !workspaceId ? (
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
        ) : files.length > 0 ? (
          <div onDoubleClick={handleTreeDoubleClick}>
            <RichTreeView
              onItemClick={handleItemClick}
              expandedItems={expandedItems}
              onExpandedItemsChange={(_event: React.SyntheticEvent, itemIds: string[]) => {
                setExpandedItems(itemIds);
                for (const itemId of itemIds) {
                  loadItemChildren(itemId);
                }
              }}
              items={files}
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
