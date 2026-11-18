/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import isEqual from "../../utils/isEqual";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileInfo } from "../../stores/ApiTypes";
import { isWithinDirectory } from "@nodetool-ai/protocol";
import { trpcClient } from "../../trpc/client";
import { Box, EditorButton, Skeleton, BORDER_RADIUS, MOTION, SPACING, getSpacingPx, PanelHeader, EmptyState, ContextMenu, MenuItemPrimitive, FlexRow, ToolbarIconButton } from "../ui_primitives";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { RefreshButton } from "../ui_primitives";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../stores/PanelStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useProjectFolder } from "../../hooks/useProjectFolder";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { fileManagerKind } from "../../utils/platform";
import { useOpenProjectConnection } from "../../lib/websocket/openProjectSignal";
import { serializeDragData } from "../../lib/dragdrop/serialization";
import {
  folderEntryPath,
  isReservedProjectEntry,
  revealLabelKey
} from "./projectFolderPaths";
import WorkspaceTreeRow from "./WorkspaceTreeItem";
import WorkspaceFilePreview from "./WorkspaceFilePreview";
import {
  WorkspaceDeleteDialog,
  WorkspaceNameDialog,
  type DeleteRequest,
  type NameRequest
} from "./WorkspaceTreeDialogs";
import {
  NotAnAssetError,
  assetDirectoryPath,
  canMoveInto,
  countFilesUnder,
  createFolder,
  deleteEntry,
  isDocumentFile,
  moveEntry,
  renameEntry
} from "./workspaceTreeActions";

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

    ".file-tree-container": {
      flex: 1,
      overflowY: "auto",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.md,
      padding: getSpacingPx(SPACING.md),
      backgroundColor: theme.vars.palette.background.default,
      transition: MOTION.border
    },

    ".file-tree-container.drop-active": {
      borderColor: theme.vars.palette.primary.main
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

    ".skeleton-tree": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm),
      padding: `${getSpacingPx(SPACING.xs)} 0`
    }
  });

/** Row height of the Files list, in px. Fixed, so the list can virtualize. */
const ROW_HEIGHT = 28;

const treeListStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    "--tree-indent": getSpacingPx(SPACING.lg),
    outline: "none",

    ".tree-row": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      paddingRight: getSpacingPx(SPACING.sm),
      borderRadius: BORDER_RADIUS.xs,
      cursor: "pointer",
      userSelect: "none",
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".tree-row.selected": {
      backgroundColor: `${theme.vars.palette.primary.main}44`,
      color: theme.vars.palette.primary.light
    },
    ".tree-row.placeholder": {
      color: theme.vars.palette.text.disabled,
      fontStyle: "italic",
      cursor: "default"
    },
    ".tree-label": {
      fontSize: "inherit",
      color: "inherit",
      minWidth: 0
    },
    ".tree-chevron": {
      display: "inline-flex",
      width: "var(--fontSizeNormal)",
      flexShrink: 0
    },
    ".row-icon": {
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.secondary,
      flexShrink: 0,
      transition: MOTION.transform
    },
    ".row-icon.expanded": {
      transform: "rotate(90deg)"
    },
    ".folder-icon": {
      color: theme.vars.palette.info.light
    }
  });

/** One visible row of the flattened tree. */
interface VisibleRow {
  readonly item: TreeViewItem;
  readonly depth: number;
}

const isPlaceholderId = (id: string): boolean =>
  id.endsWith("/loading") || id.endsWith("/error");

/** The rows the tree shows: every root item, plus the children of expanded folders. */
const flattenVisible = (
  items: TreeViewItem[],
  expanded: ReadonlySet<string>,
  depth = 0,
  out: VisibleRow[] = []
): VisibleRow[] => {
  for (const item of items) {
    out.push({ item, depth });
    if (item.children && expanded.has(item.id)) {
      flattenVisible(item.children, expanded, depth + 1, out);
    }
  }
  return out;
};

const createErrorItem = (itemId: string, errorLabel: string): TreeViewItem => ({
  id: `${itemId}/error`,
  label: errorLabel,
  children: undefined,
  className: "error-item"
});

const fileToTreeItem = (file: FileInfo, loadingLabel: string): TreeViewItem => {
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
        label: loadingLabel,
        className: "loading-item",
        children: []
      }
    ];
  }

  return item;
};

const fetchWorkspaceFiles = async (
  workspaceId: string,
  loadingLabel: string,
  path: string = "."
): Promise<TreeViewItem[]> => {
  const data = await trpcClient.workspace.listFiles.query({
    id: workspaceId,
    path
  });
  // `.nodetool/` is NodeTool's own data. It sits at the folder root only.
  return data
    .filter((file) => !isReservedProjectEntry(file))
    .sort((a, b) =>
      a.is_dir !== b.is_dir
        ? a.is_dir ? -1 : 1
        : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    )
    .map((file) => fileToTreeItem(file, loadingLabel));
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

/**
 * The project-folder directory a file dropped on `item` lands in: a folder
 * row is that folder, a file row is the folder it is in, and anywhere else in
 * the tree is the project folder itself (`.`).
 */
const dropDirectoryFor = (itemId: string | null, item: TreeViewItem | undefined): string => {
  if (!itemId || itemId.endsWith("/loading") || itemId.endsWith("/error")) {
    return ".";
  }
  if (item?.treeItemProps?.className === "folder-item") {
    return itemId;
  }
  const slash = itemId.lastIndexOf("/");
  return slash > 0 ? itemId.slice(0, slash) : ".";
};

/** The drag type of a Files row moved inside the tree. */
const ENTRY_DRAG_TYPE = "application/x-nodetool-project-entry";

/** True when a drag carries a row of the tree. */
const carriesEntry = (event: React.DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes(ENTRY_DRAG_TYPE);

/** True when a drag carries files from the OS rather than an in-app item. */
const carriesFiles = (event: React.DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes("Files");

const rowIdFromEvent = (event: React.SyntheticEvent): string | null =>
  (event.target as HTMLElement)
    .closest('[data-testid="tree-item"]')
    ?.getAttribute("data-itemid") ?? null;

const isFolderItem = (item: TreeViewItem | undefined): boolean =>
  item?.treeItemProps?.className === "folder-item";

const shouldLoadChildren = (item: TreeViewItem | undefined, loadingLabel: string): boolean => {
  return Boolean(
    item?.children?.length === 1 && item.children[0].label === loadingLabel
  );
};

/**
 * The Files section: the tree of the selected project's folder.
 *
 * The folder is the one the project API reports (`folder.workspace_id`), so
 * switching project moves the tree and nothing else does. It needs no workflow
 * and no choice of folder. `.nodetool/` is hidden.
 */
interface WorkspaceTreeProps {
  readonly projectId: string;
}

const WorkspaceTree: React.FC<WorkspaceTreeProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // Opens the socket, so the folder is watched and the tree hears of renames.
  useOpenProjectConnection();
  const [files, setFiles] = useState<TreeViewItem[]>([]);
  const filesRef = useRef<TreeViewItem[]>([]);
  filesRef.current = files;
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const expandedItemsRef = useRef<string[]>([]);
  expandedItemsRef.current = expandedItems;

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setPanelVisibility = usePanelStore((state) => state.setVisibility);
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const [isDropActive, setIsDropActive] = useState(false);

  const { folder, isLoading: isLoadingWorkspaces } =
    useProjectFolder(projectId);
  const workspaceId = folder?.workspace_id;
  const workspaceIdRef = useRef<string | undefined>(workspaceId);
  workspaceIdRef.current = workspaceId;

  const {
    data: initialFiles,
    dataUpdatedAt,
    isLoading: isLoadingFiles,
    refetch: refetchFiles
  } = useQuery({
    queryKey: ["workspace-files", workspaceId],
    queryFn: () =>
      workspaceId
        ? fetchWorkspaceFiles(workspaceId, t("batch2_1.tree.loading"))
        : Promise.resolve([]),
    enabled: Boolean(workspaceId)
  });

  // The query answers with the root listing; lazily-loaded children are merged
  // into this copy as folders expand.
  //
  // A refetch replaces the whole tree, which puts a `Loading…` placeholder
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
          children: await fetchWorkspaceFiles(wsId, t("batch2_1.tree.loading"), itemId).catch(() => [
            createErrorItem(itemId, t("batch2_1.tree.accessDenied"))
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
      if (!shouldLoadChildren(targetItem, t("batch2_1.tree.loading"))) return;

      try {
        const children = await fetchWorkspaceFiles(wsId, t("batch2_1.tree.loading"), itemId || ".");
        if (workspaceIdRef.current !== wsId) return;
        setFiles((prev) => updateTreeWithChildren(prev, itemId, children));
      } catch (error) {
        if (workspaceIdRef.current !== wsId) return;
        console.error("Failed to load children:", error);
        setFiles((prev) => updateTreeWithChildren(prev, itemId, [createErrorItem(itemId, t("batch2_1.tree.accessDenied"))]));
      }
    },
    [t]
  );

  // Double-click opens the file as a workspace tab. A workflow or timeline
  // file opens its document's editor. Handing it to the OS is a secondary
  // action on the selected file ("Open Externally"), Electron only.
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
      if (isDocumentFile(itemId)) {
        const document = await trpcClient.projects.documentByFile
          .query({ id: projectId, path: itemId })
          .catch((error: unknown) => {
            // The file still opens, as a file.
            console.warn("Could not find the document of a file", error);
            return null;
          });
        if (document) {
          openTab({
            type: document.type,
            ref: document.ref,
            mode: "edit",
            title: document.name,
            projectId
          });
          setPanelVisibility(false);
          return;
        }
      }
      openTab({
        type: "workspace-file",
        ref: `${wsId}::${itemId}`,
        mode: "view",
        title: item?.label ?? itemId.split("/").pop() ?? itemId,
        projectId
      });
      setPanelVisibility(false);
    },
    [loadItemChildren, openTab, projectId, setPanelVisibility]
  );

  const handleOpenExternally = useCallback(async () => {
    if (!selectedFilePath) { return; }
    if (window.api?.shell?.openPath) {
      await window.api.shell.openPath(selectedFilePath);
    }
  }, [selectedFilePath]);

  const revealPath = folder?.path ?? null;
  const canReveal = Boolean(revealPath && window.api?.showItemInFolder);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    itemId: string;
  } | null>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!workspaceIdRef.current) {
        return;
      }
      event.preventDefault();
      const target = event.target as HTMLElement;
      const treeItem = target.closest('[data-testid="tree-item"]');
      const itemId = treeItem?.getAttribute("data-itemid") ?? "";
      setMenu({
        x: event.clientX,
        y: event.clientY,
        itemId:
          itemId.endsWith("/loading") || itemId.endsWith("/error") ? "" : itemId
      });
    },
    []
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleReveal = useCallback(() => {
    if (revealPath && menu) {
      void window.api?.showItemInFolder?.(
        folderEntryPath(revealPath, menu.itemId)
      );
    }
    setMenu(null);
  }, [menu, revealPath]);

  const canOpenFolder = Boolean(revealPath && window.api?.shell?.openPath);
  const handleOpenFolder = useCallback(() => {
    if (revealPath) {
      void window.api?.shell?.openPath?.(revealPath);
    }
  }, [revealPath]);

  const handleRefresh = useCallback(() => {
    refetchFiles();
  }, [refetchFiles]);

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

  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [nameRequest, setNameRequest] = useState<
    (NameRequest & { path: string }) | null
  >(null);
  const [deleteRequest, setDeleteRequest] = useState<
    (DeleteRequest & { path: string }) | null
  >(null);

  // Every change reaches the tree and the asset library.
  const runChange = useCallback(
    async (change: () => Promise<void>): Promise<void> => {
      try {
        await change();
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content:
            error instanceof NotAnAssetError
              ? t("projectFolder.tree.notAnAsset")
              : t("projectFolder.tree.actionFailed", {
                  error: error instanceof Error ? error.message : String(error)
                })
        });
      } finally {
        void refetchFiles();
        void queryClient.invalidateQueries({ queryKey: ["assets"] });
      }
    },
    [addNotification, queryClient, refetchFiles, t]
  );

  const moveDroppedEntry = useCallback(
    async (source: string, directory: string): Promise<void> => {
      if (!source || isPlaceholderId(source)) { return; }
      const isDirectory = isFolderItem(findItemInTree(filesRef.current, source));
      if (!canMoveInto(source, isDirectory, directory)) {
        if (isDirectory && isWithinDirectory(assetDirectoryPath(directory), source)) {
          addNotification({
            type: "error",
            alert: true,
            content: t("projectFolder.tree.moveIntoItself")
          });
        }
        return;
      }
      await runChange(() => moveEntry(projectId, source, isDirectory, directory));
    },
    [addNotification, projectId, runChange, t]
  );

  const menuItem = menu ? findItemInTree(files, menu.itemId) : undefined;
  const menuIsDirectory = !menu?.itemId || isFolderItem(menuItem);

  const handleNewFolder = useCallback(() => {
    if (!menu) { return; }
    const parent = menu.itemId || ".";
    setNameRequest({
      kind: "create",
      initialName: t("i18n-next27.assetCreateFolder.defaultName"),
      isDirectory: true,
      path: parent
    });
    setMenu(null);
  }, [menu, t]);

  const handleRename = useCallback(() => {
    if (!menu?.itemId) { return; }
    const item = findItemInTree(filesRef.current, menu.itemId);
    setNameRequest({
      kind: "rename",
      initialName: item?.label ?? menu.itemId.split("/").pop() ?? menu.itemId,
      isDirectory: isFolderItem(item),
      path: menu.itemId
    });
    setMenu(null);
  }, [menu]);

  const handleDelete = useCallback(() => {
    if (!menu?.itemId) { return; }
    const path = menu.itemId;
    const item = findItemInTree(filesRef.current, path);
    const isDirectory = isFolderItem(item);
    setMenu(null);
    const name = item?.label ?? path;
    if (!isDirectory) {
      setDeleteRequest({ name, isDirectory, fileCount: 1, path });
      return;
    }
    void runChange(async () => {
      const fileCount = await countFilesUnder(projectId, path);
      setDeleteRequest({ name, isDirectory, fileCount, path });
    });
  }, [menu, projectId, runChange]);

  const submitName = useCallback(
    (name: string) => {
      const request = nameRequest;
      setNameRequest(null);
      if (!request) { return; }
      void runChange(() =>
        request.kind === "create"
          ? createFolder(projectId, request.path, name)
          : renameEntry(projectId, request.path, request.isDirectory, name)
      );
    },
    [nameRequest, projectId, runChange]
  );

  const confirmDelete = useCallback(() => {
    const request = deleteRequest;
    setDeleteRequest(null);
    if (!request) { return; }
    void runChange(() => deleteEntry(projectId, request.path, request.isDirectory));
  }, [deleteRequest, projectId, runChange]);

  const closeNameDialog = useCallback(() => setNameRequest(null), []);
  const closeDeleteDialog = useCallback(() => setDeleteRequest(null), []);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const itemId = rowIdFromEvent(e);
    if (!itemId || isPlaceholderId(itemId)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(ENTRY_DRAG_TYPE, itemId);
    e.dataTransfer.effectAllowed = "move";
    // A file also drops onto the canvas: a media file as its asset's node, a
    // document file as the constant that references the document.
    const isFolder = isFolderItem(findItemInTree(filesRef.current, itemId));
    if (!isFolder) {
      serializeDragData(
        { type: "project-file", payload: { projectId, path: itemId } },
        e.dataTransfer
      );
    }
  }, [projectId]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const isEntry = carriesEntry(e);
    if (!isEntry && !carriesFiles(e)) { return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = isEntry ? "move" : "copy";
    setIsDropActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) { return; }
    setIsDropActive(false);
  }, []);

  // A file dropped on the tree is uploaded into the project folder, into the
  // directory it was dropped on, and becomes an asset there.
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const isEntry = carriesEntry(e);
      if (!isEntry && !carriesFiles(e)) { return; }
      e.preventDefault();
      setIsDropActive(false);
      const treeItem = (e.target as HTMLElement).closest('[data-testid="tree-item"]');
      const itemId = treeItem?.getAttribute("data-itemid") ?? null;
      const directory = dropDirectoryFor(
        itemId,
        itemId ? findItemInTree(filesRef.current, itemId) : undefined
      );
      if (isEntry) {
        void moveDroppedEntry(e.dataTransfer.getData(ENTRY_DRAG_TYPE), directory);
        return;
      }
      for (const file of Array.from(e.dataTransfer.files)) {
        uploadAsset({
          file,
          project_id: projectId,
          directory,
          onCompleted: () => { void refetchFiles(); }
        });
      }
    },
    [moveDroppedEntry, projectId, refetchFiles, uploadAsset]
  );

  const visibleRows = useMemo(
    () => flattenVisible(files, new Set(expandedItems)),
    [files, expandedItems]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  });

  const toggleFolder = useCallback(
    (itemId: string) => {
      const isOpen = expandedItemsRef.current.includes(itemId);
      setExpandedItems((prev) =>
        isOpen ? prev.filter((id) => id !== itemId) : [...prev, itemId]
      );
      if (!isOpen) {
        void loadItemChildren(itemId);
      }
    },
    [loadItemChildren]
  );

  const handleListClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const itemId = rowIdFromEvent(event);
      if (!itemId || isPlaceholderId(itemId)) { return; }
      setSelectedFilePath(itemId);
      if (findItemInTree(filesRef.current, itemId)?.children) {
        toggleFolder(itemId);
      }
    },
    [toggleFolder]
  );

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = visibleRows.findIndex(
        (row) => row.item.id === selectedFilePath
      );
      const current = index >= 0 ? visibleRows[index] : undefined;
      const select = (next: number): void => {
        const row = visibleRows[Math.max(0, Math.min(visibleRows.length - 1, next))];
        if (row) {
          setSelectedFilePath(row.item.id);
          virtualizer.scrollToIndex(visibleRows.indexOf(row));
        }
      };
      switch (event.key) {
        case "ArrowDown":
          select(index + 1);
          break;
        case "ArrowUp":
          select(index - 1);
          break;
        case "ArrowRight":
          if (current?.item.children && !expandedItems.includes(current.item.id)) {
            toggleFolder(current.item.id);
          }
          break;
        case "ArrowLeft":
          if (current?.item.children && expandedItems.includes(current.item.id)) {
            toggleFolder(current.item.id);
          }
          break;
        case "Enter":
          if (current) { void handleItemDoubleClick(event as unknown as React.MouseEvent, current.item.id); }
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [visibleRows, selectedFilePath, expandedItems, toggleFolder, handleItemDoubleClick, virtualizer]
  );

  // A selected file, not a folder or a placeholder row, gets a preview.
  const selectedItem = findItemInTree(files, selectedFilePath);
  const previewPath =
    selectedFilePath &&
    !isPlaceholderId(selectedFilePath) &&
    selectedItem &&
    !isFolderItem(selectedItem)
      ? selectedFilePath
      : null;

  return (
    <Box css={workspaceTreeStyles(theme)}>
      <PanelHeader
        title={t("projectFolder.tree.title")}
        docsTopic="workspaces"
        actions={
          <FlexRow gap={SPACING.xs} align="center">
            {canOpenFolder && (
              <ToolbarIconButton
                icon={<FolderOpenIcon />}
                tooltip={t(revealLabelKey(fileManagerKind()))}
                tooltipPlacement="bottom"
                onClick={handleOpenFolder}
              />
            )}
            <RefreshButton
              onClick={handleRefresh}
              tooltip={t("batch2_1.common.refresh")}
              tooltipPlacement="bottom"
            />
          </FlexRow>
        }
      />

      {selectedFilePath && !selectedFilePath.includes("/loading") && (
        <div className="tree-actions">
          {Boolean(window.api?.shell?.openPath) && (
            <EditorButton
              className="open-folder-button"
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={handleOpenExternally}
            >
              {t("batch2_1.tree.openExternally")}
            </EditorButton>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={`file-tree-container${isDropActive ? " drop-active" : ""}`}
        data-testid="workspace-file-drop"
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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
          <EmptyState
            size="small"
            icon={<FolderOpenIcon />}
            title={t("projectFolder.tree.noFolderTitle")}
            description={t("projectFolder.tree.noFolderDescription")}
          />
        ) : files.length > 0 ? (
          <div
            role="tree"
            tabIndex={0}
            aria-label={t("projectFolder.tree.fileBrowser")}
            aria-activedescendant={
              selectedFilePath ? `workspace-tree-${selectedFilePath}` : undefined
            }
            css={treeListStyles(theme)}
            style={{ height: virtualizer.getTotalSize() }}
            onClick={handleListClick}
            onDoubleClick={handleTreeDoubleClick}
            onKeyDown={handleListKeyDown}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const { item, depth } = visibleRows[virtualRow.index];
              return (
                <WorkspaceTreeRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  depth={depth}
                  isFolder={Boolean(item.children) && !isPlaceholderId(item.id)}
                  isPlaceholder={isPlaceholderId(item.id)}
                  expanded={expandedItems.includes(item.id)}
                  selected={item.id === selectedFilePath}
                  workspaceId={workspaceId}
                  top={virtualRow.start}
                  height={ROW_HEIGHT}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            size="small"
            icon={<FolderOpenIcon />}
            title={t("projectFolder.tree.emptyTitle")}
            description={t("projectFolder.tree.emptyDescription")}
          />
        )}
      </div>

      {previewPath && (
        <WorkspaceFilePreview projectId={projectId} path={previewPath} />
      )}

      <ContextMenu
        open={menu !== null}
        position={menu ? { x: menu.x, y: menu.y } : null}
        onClose={closeMenu}
      >
        {menuIsDirectory && (
          <MenuItemPrimitive
            label={t("assets.newFolder")}
            onClick={handleNewFolder}
          />
        )}
        {Boolean(menu?.itemId) && (
          <MenuItemPrimitive
            label={t("batch2_0.rename")}
            onClick={handleRename}
          />
        )}
        {Boolean(menu?.itemId) && (
          <MenuItemPrimitive
            label={t("i18n-next27.assetDelete.delete")}
            onClick={handleDelete}
          />
        )}
        {canReveal && (
          <MenuItemPrimitive
            label={t(revealLabelKey(fileManagerKind()))}
            onClick={handleReveal}
          />
        )}
      </ContextMenu>
      <WorkspaceNameDialog
        request={nameRequest}
        onClose={closeNameDialog}
        onSubmit={submitName}
      />
      <WorkspaceDeleteDialog
        request={deleteRequest}
        onClose={closeDeleteDialog}
        onConfirm={confirmDelete}
      />
    </Box>
  );
};

export default memo(WorkspaceTree, isEqual);
