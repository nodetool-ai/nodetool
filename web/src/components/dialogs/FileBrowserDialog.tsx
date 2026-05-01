/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  memo
} from "react";
import {
  useTheme,
  type Theme
} from "@mui/material/styles";
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ArrowUpward as ArrowUpwardIcon
} from "@mui/icons-material";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { TreeViewBaseItem } from "@mui/x-tree-view/models";
import { useVirtualizer } from "@tanstack/react-virtual";
import { trpcClient } from "../../trpc/client";
import type { FileInfo } from "../../stores/ApiTypes";

import {
  Breadcrumbs,
  CloseButton,
  CopyButton,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  ListItemRow,
  LoadingSpinner,
  RefreshButton,
  Text,
  Caption,
  SearchInput,
  TextInput,
  ToolbarIconButton
} from "../ui_primitives";

export type SelectionMode = "file" | "directory";

interface FileBrowserDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (path: string) => void;
  title?: string;
  initialPath?: string;
  selectionMode?: SelectionMode;
}

// Extended Tree Item type for RichTreeView
type ExtendedTreeItem = TreeViewBaseItem & {
  id: string;
  label: string;
  children?: ExtendedTreeItem[];
  path: string; // Store full path
};

const styles = (theme: Theme) =>
  css({
    ".file-browser-content": {
      minHeight: 0,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "0",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.paper
    },
    ".left-panel": {
      width: "250px",
      minWidth: "200px",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default,
      overflow: "hidden"
    },
    ".right-panel": {
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.paper
    },
    ".breadcrumbs": {
      flex: 1,
      minWidth: 0
    },
    ".file-list": {
      flex: 1,
      outline: "none"
    },
    ".folder-tree": {
      overflowY: "auto",
      flex: 1,
      padding: "8px"
    },
    // Tree View Styles
    ".MuiTreeItem-content": {
      borderRadius: "var(--rounded-sm)",
      padding: "4px 8px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.action.selected
      }
    }
  });

// --- Helper Functions ---

const fetchFileList = async (path: string): Promise<FileInfo[]> => {
  return trpcClient.files.list.query({ path });
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) {return "0 Bytes";}
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// --- Component ---

function FileBrowserDialog({
  open,
  onClose,
  onConfirm,
  title = "Select File",
  initialPath = "~",
  selectionMode = "file"
}: FileBrowserDialogProps) {
  const theme = useTheme();

  // --- State ---
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInputValue, setPathInputValue] = useState(initialPath);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Tree State
  const [treeItems, setTreeItems] = useState<ExtendedTreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const treeScrollRef = useRef<HTMLDivElement>(null);

  // --- Memos (Moved up for usage in effects) ---

  // Sort files: Folders first, then files (memoized for performance)
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.is_dir === b.is_dir) {return a.name.localeCompare(b.name);}
      return a.is_dir ? -1 : 1;
    });
  }, [files]);

  // Filter files (after sorting)
  const filteredFiles = useMemo(() => {
    if (!searchQuery) {return sortedFiles;}
    // Optimization: Convert search query to lowercase once
    const searchQueryLower = searchQuery.toLowerCase();
    return sortedFiles.filter((f) =>
      f.name.toLowerCase().includes(searchQueryLower)
    );
  }, [sortedFiles, searchQuery]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    // Detect likely separator from current path
    const separator = currentPath.includes("\\") ? "\\" : "/";
    // Memoize the regex pattern to avoid recreating on every render
    const pathSplitRegex = /[/\\]/;
    const parts = currentPath.split(pathSplitRegex).filter(Boolean);
    const items = [];
    let pathAcc = "";

    // Special handling for root based on OS style
    if (currentPath.startsWith("/")) {
      // Unix absolute
      items.push({ name: "Root", path: "/" });
      pathAcc = "";
    } else if (currentPath.includes(":")) {
      // Windows absolute probably
      pathAcc = "";
    } else if (currentPath.startsWith("~")) {
      // Home relative
      items.push({ name: "Home", path: "~" });
      pathAcc = "~";
      parts.shift();
    }

    parts.forEach((part) => {
      if (pathAcc === "" && currentPath.startsWith("/")) {
        pathAcc = `/${part}`;
      } else if (pathAcc === "" && part.includes(":")) {
        // Windows drive root
        pathAcc = part + "\\";
      } else if (pathAcc.endsWith("/") || pathAcc.endsWith("\\")) {
        pathAcc = `${pathAcc}${part}`;
      } else {
        // Default separator
        pathAcc = `${pathAcc}${separator}${part}`;
      }
      items.push({ name: part, path: pathAcc });
    });
    return items;
  }, [currentPath]);

  // --- Effects ---

  // Sync input value when path changes externally
  useEffect(() => {
    setPathInputValue(currentPath);
  }, [currentPath]);

  // Auto-scroll to selected item in tree
  useEffect(() => {
    if (!treeScrollRef.current) {return;}

    // Allow some time for expansion/rendering
    const timeoutId = setTimeout(() => {
      const selected = treeScrollRef.current?.querySelector(".Mui-selected");
      if (selected) {
        selected.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentPath, expandedItems, treeItems]);

  // Initial Tree Load
  useEffect(() => {
    const loadRoots = async () => {
      try {
        const rootFiles = await fetchFileList("~");
        const roots = rootFiles
          .filter((f) => f.is_dir)
          .map((f) => ({
            id: f.path,
            label: f.name,
            path: f.path,
            children: [
              { id: `${f.path}_loading`, label: "Loading...", path: "" }
            ] as ExtendedTreeItem[]
          }));
        setTreeItems(roots);
      } catch (e) {
        console.error("Failed to load roots", e);
      }
    };
    if (open && treeItems.length === 0) {
      loadRoots();
    }
  }, [open, treeItems.length]);

  // Helper to update tree items recursively
  const updateTreeItemsBulk = useCallback(
    (updates: { id: string; children: ExtendedTreeItem[] }[]) => {
      if (updates.length === 0) {return;}
      setTreeItems((prevItems) => {
        let currentItems = prevItems;

        const updateRecursive = (
          items: ExtendedTreeItem[],
          targetId: string,
          newChildren: ExtendedTreeItem[]
        ): ExtendedTreeItem[] => {
          return items.map((item) => {
            if (item.id === targetId) {
              return { ...item, children: newChildren };
            }
            if (item.children) {
              const updatedChildren = updateRecursive(
                item.children,
                targetId,
                newChildren
              );
              if (updatedChildren !== item.children) {
                return { ...item, children: updatedChildren };
              }
            }
            return item;
          });
        };

        for (const update of updates) {
          currentItems = updateRecursive(
            currentItems,
            update.id,
            update.children
          );
        }
        return currentItems;
      });
    },
    []
  );

  const updateTreeItem = useCallback(
    (itemId: string, newChildren: ExtendedTreeItem[]) => {
      updateTreeItemsBulk([{ id: itemId, children: newChildren }]);
    },
    [updateTreeItemsBulk]
  );

  // Load ancestors of currentPath to ensure it is visible in tree
  useEffect(() => {
    if (!open || treeItems.length === 0) {return;}

    const loadMissingAncestors = async () => {
      // Find ancestors that are in the tree but have "Loading..." children
      // We skip the current path itself since we only need its parent loaded to show it
      // (or if we want to show children of current path in tree, we could include it)

      // Breadcrumbs contains the full path hierarchy
      // We iterate and check if each segment is loaded

      const findNode = (
        items: ExtendedTreeItem[],
        id: string
      ): ExtendedTreeItem | undefined => {
        for (const item of items) {
          if (item.id === id) {return item;}
          if (item.children) {
            const found = findNode(item.children, id);
            if (found) {return found;}
          }
        }
        return undefined;
      };

      // Parallel loading optimization:
      // identify all paths that need loading (either missing from tree or placeholder)
      // and fetch them in parallel.

      const pathsToFetch: string[] = [];

      for (const breadcrumb of breadcrumbs) {
        // Skip Root/Home placeholders if they aren't in tree (tree roots are their children)
        if (breadcrumb.path === "~" || breadcrumb.path === "/") {continue;}

        const node = findNode(treeItems, breadcrumb.path);
        // If node is found, check if it's a placeholder
        if (node) {
          const isPlaceholder =
            node.children &&
            node.children.length === 1 &&
            node.children[0].id.endsWith("_loading");
          if (isPlaceholder) {
            pathsToFetch.push(breadcrumb.path);
          }
        } else {
          // If node is not found, we assume it needs to be loaded as part of the chain
          // (it will become available once its parent is loaded)
          pathsToFetch.push(breadcrumb.path);
        }
      }

      if (pathsToFetch.length === 0) {return;}

      try {
        const results = await Promise.all(
          pathsToFetch.map(async (path) => {
            try {
              const fileList = await fetchFileList(path);
              const folders = fileList
                .filter((f) => f.is_dir)
                .map((f) => ({
                  id: f.path,
                  label: f.name,
                  path: f.path,
                  children: [
                    { id: `${f.path}_loading`, label: "Loading...", path: "" }
                  ] as ExtendedTreeItem[]
                }));
              return { id: path, children: folders.length > 0 ? folders : [] };
            } catch (e) {
              console.error(`Failed to load tree node ${path}`, e);
              // Return empty children on failure to stop loading spinner (if any)
              // But if the node doesn't exist, this update will just be ignored
              return { id: path, children: [] as ExtendedTreeItem[] };
            }
          })
        );

        // Filter out results where fetch failed completely (though we catch above)
        // and apply updates.
        // Important: updates should be applied in order?
        // updateTreeItemsBulk handles sequential application on state.
        // Since we are building the tree top-down, and pathsToFetch preserves breadcrumb order (depth),
        // the updates will be applied parent-first, which is correct.

        updateTreeItemsBulk(results);
      } catch (e) {
        console.error("Failed to load ancestors in parallel", e);
      }
    };

    loadMissingAncestors();
  }, [currentPath, breadcrumbs, open, treeItems, updateTreeItemsBulk]);

  // Sync expansion when navigating
  useEffect(() => {
    if (currentPath === "~" || currentPath === "/" || currentPath === "")
      {return;}

    // Expand all ancestor paths derived from breadcrumbs
    const ancestorPaths = breadcrumbs.map((b) => b.path);

    setExpandedItems((prev) => {
      const next = new Set(prev);
      ancestorPaths.forEach((p) => next.add(p));
      return Array.from(next);
    });
  }, [currentPath, breadcrumbs]);

  // Load files for right panel
  useEffect(() => {
    const loadFiles = async () => {
      setIsLoadingFiles(true);
      try {
        const fileList = await fetchFileList(currentPath);
        setFiles(fileList);
      } catch (err) {
        console.error("Failed to load files", err);
      } finally {
        setIsLoadingFiles(false);
      }
    };
    if (open) {
      loadFiles();
    }
  }, [currentPath, open]);

  // --- Handlers ---

  const handlePathSubmit = async () => {
    const path = pathInputValue.trim();

    if (selectionMode === "file" && path) {
      try {
        // Try to list as directory first
        await fetchFileList(path);
        handleNavigate(path);
      } catch {
        // If listing fails, assume it's a file path
        // Try to navigate to parent and select the file
        const parts = path.split(/[/\\]/);
        if (parts.length > 1) {
          const separator = path.includes("\\") ? "\\" : "/";
          parts.pop();
          let parent = parts.join(separator);

          // Handle root/drive cases
          if (path.startsWith("/") && parent === "") {parent = "/";}
          if (parent.endsWith(":")) {parent += separator;}

          setCurrentPath(parent);
          setSelectedPath(path);
          setSearchQuery("");
        } else {
          handleNavigate(path);
        }
      }
    } else {
      handleNavigate(path);
    }
    setIsEditingPath(false);
  };

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
    if (selectionMode === "directory") {
      setSelectedPath(path);
    } else {
      setSelectedPath("");
    }
  }, [selectionMode]);

  const handleStartEditPath = useCallback(() => {
    setIsEditingPath(true);
  }, []);

  const handleUp = useCallback(() => {
    if (currentPath === "~" || currentPath === "/") {return;}
    // Naive parent path
    const separator = currentPath.includes("\\") ? "\\" : "/";
    const parts = currentPath.split(/[/\\]/);
    parts.pop();

    let parent = parts.join(separator);
    if (currentPath.startsWith("/") && parent === "") {parent = "/";}
    if (parent.endsWith(":")) {parent += "\\";} // Windows drive root often needs backslash

    handleNavigate(parent || "~");
  }, [currentPath, handleNavigate]);

  const handleRefresh = useCallback(() => {
    handleNavigate(currentPath);
  }, [currentPath, handleNavigate]);

  const handleFileClick = useCallback((file: FileInfo) => {
    if (file.is_dir) {
      if (selectionMode === "directory") {
        setSelectedPath(file.path);
      }
    } else {
      if (selectionMode === "file") {
        setSelectedPath(file.path);
      }
    }
  }, [selectionMode]);

  const handleFileDoubleClick = useCallback((file: FileInfo) => {
    if (file.is_dir) {
      handleNavigate(file.path);
    } else {
      if (selectionMode === "file") {
        setSelectedPath(file.path);
        onConfirm(file.path);
      }
    }
  }, [selectionMode, handleNavigate, onConfirm]);

  const handleConfirmClick = useCallback(() => {
    if (selectedPath) {
      onConfirm(selectedPath);
    }
  }, [selectedPath, onConfirm]);

  const handlePathInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPathInputValue(e.target.value);
  }, []);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // --- Tree Logic ---

  const handleItemExpansionToggle = async (
    event: React.SyntheticEvent,
    itemId: string,
    isExpanded: boolean
  ) => {
    if (isExpanded) {
      // Find the item in treeItems to check if it needs loading
      const findNode = (
        items: ExtendedTreeItem[]
      ): ExtendedTreeItem | undefined => {
        for (const item of items) {
          if (item.id === itemId) {return item;}
          if (item.children) {
            const found = findNode(item.children);
            if (found) {return found;}
          }
        }
        return undefined;
      };

      const node = findNode(treeItems);

      // Check if children is placeholder
      if (
        node &&
        node.children &&
        node.children.length === 1 &&
        node.children[0].id.endsWith("_loading")
      ) {
        try {
          // Fetch children folders
          const fileList = await fetchFileList(node.path);
          const folders = fileList
            .filter((f) => f.is_dir)
            .map((f) => ({
              id: f.path,
              label: f.name,
              path: f.path,
              children: [
                { id: `${f.path}_loading`, label: "Loading...", path: "" }
              ] as ExtendedTreeItem[]
            }));

          if (folders.length === 0) {
            updateTreeItem(itemId, []);
          } else {
            updateTreeItem(itemId, folders);
          }
        } catch (e) {
          console.error("Failed to load tree children", e);
          updateTreeItem(itemId, []);
        }
      }
    }
    setExpandedItems((prev) =>
      isExpanded ? [...prev, itemId] : prev.filter((id) => id !== itemId)
    );
  };

  const handleTreeItemClick = useCallback((event: React.MouseEvent, itemId: string) => {
    if (itemId.endsWith("_loading")) {return;}
    handleNavigate(itemId);
  }, [handleNavigate]);

  const handleBreadcrumbNavigate = useCallback(
    (item: { path?: string }, index: number) => {
      const path = item.path || breadcrumbs[index]?.path;
      if (path) {
        handleNavigate(path);
      }
    },
    [breadcrumbs, handleNavigate]
  );

  // --- Virtualization ---

  const fileListScrollRef = useRef<HTMLDivElement>(null);
  const fileVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => fileListScrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
    getItemKey: (index) => filteredFiles[index]?.path ?? index,
  });

  return (
    <Dialog
      className="file-browser-dialog"
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: { height: "80vh", maxHeight: "800px" }
        }
      }}
    >
      <FlexColumn
        css={styles(theme)}
        sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}
        gap={0}
      >
        <FlexRow
          align="center"
          gap={2}
          sx={{
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.default
          }}
        >
          <ToolbarIconButton
            icon={<ArrowUpwardIcon fontSize="small" />}
            tooltip="Up one level"
            onClick={handleUp}
            disabled={currentPath === "~" || currentPath === "/"}
            size="small"
          />

          {isEditingPath ? (
            <TextInput
              size="small"
              fullWidth
              value={pathInputValue}
              onChange={handlePathInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {handlePathSubmit();}
                if (e.key === "Escape") {
                  setPathInputValue(currentPath);
                  setIsEditingPath(false);
                }
              }}
              onBlur={() => setIsEditingPath(false)}
              autoFocus
              sx={{ flex: 1 }}
            />
          ) : (
            <FlexRow
              className="breadcrumbs-container"
              align="center"
              sx={{ flex: 1, minWidth: 100, cursor: "text" }}
              onClick={handleStartEditPath}
            >
              <Breadcrumbs
                className="breadcrumbs"
                items={breadcrumbs.map((b) => ({ label: b.name, path: b.path }))}
                separator="slash"
                onNavigate={handleBreadcrumbNavigate}
              />
            </FlexRow>
          )}

          <div style={{ width: 200 }}>
            <SearchInput
              value={searchQuery}
              onChange={handleSearchQueryChange}
              placeholder="Search in current folder..."
              fullWidth
            />
          </div>

          <RefreshButton
            onClick={handleRefresh}
            buttonSize="small"
            tooltip="Refresh"
          />
          <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
        </FlexRow>

        <FlexRow
          className="file-browser-content"
          sx={{ flex: 1, minHeight: 0, border: "none", borderRadius: 0 }}
        >
          <FlexColumn className="left-panel" sx={{ width: 250, minWidth: 200, overflow: "hidden" }}>
            <div className="folder-tree" ref={treeScrollRef}>
              <RichTreeView
                items={treeItems}
                onItemClick={handleTreeItemClick}
                onItemExpansionToggle={handleItemExpansionToggle}
                expandedItems={expandedItems}
                selectedItems={currentPath}
              />
            </div>
          </FlexColumn>

          <FlexColumn className="right-panel" sx={{ flex: 1, minWidth: 0 }}>
            {isLoadingFiles ? (
              <FlexColumn fullWidth fullHeight align="center" justify="center">
                <LoadingSpinner size="medium" />
              </FlexColumn>
            ) : (
              <div
                ref={fileListScrollRef}
                className="file-list"
                style={{
                  width: "100%",
                  height: "100%",
                  overflow: "auto",
                  outline: "none",
                }}
              >
                <div
                  style={{
                    height: fileVirtualizer.getTotalSize(),
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {fileVirtualizer.getVirtualItems().map((vi) => {
                    const file = filteredFiles[vi.index];
                    if (!file) {
                      return null;
                    }
                    const isSelected = selectedPath === file.path;
                    return (
                      <ListItemRow
                        key={vi.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: vi.size,
                          transform: `translateY(${vi.start}px)`,
                        }}
                        selected={isSelected}
                        onClick={() => handleFileClick(file)}
                        onDoubleClick={() => handleFileDoubleClick(file)}
                        icon={
                          file.is_dir ? (
                            <FolderIcon color="primary" fontSize="small" />
                          ) : (
                            <FileIcon color="action" fontSize="small" />
                          )
                        }
                        sx={{
                          px: 1.5,
                          fontSize: "0.875rem",
                          "&:hover": {
                            backgroundColor: theme.vars.palette.action.hover,
                          },
                        }}
                      >
                        <FlexRow
                          fullWidth
                          align="center"
                          justify="space-between"
                          sx={{ minWidth: 0 }}
                        >
                          <Text
                            size="small"
                            truncate
                            sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem" }}
                          >
                            {file.name}
                          </Text>
                          {file.size !== undefined && !file.is_dir && (
                            <Caption color="secondary" sx={{ ml: 1 }}>
                              {formatBytes(file.size)}
                            </Caption>
                          )}
                        </FlexRow>
                      </ListItemRow>
                    );
                  })}
                </div>
              </div>
            )}
          </FlexColumn>
        </FlexRow>

        <FlexRow
          className="file-browser-footer"
          align="center"
          gap={1}
          sx={{
            p: 2,
            borderTop: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Text size="small" color="secondary" sx={{ flex: 1, ml: 1 }}>
            {selectedPath ? `Selected: ${selectedPath}` : "No selection"}
          </Text>
          {selectedPath && (
            <CopyButton
              value={selectedPath}
              tooltip="Copy path"
              buttonSize="small"
            />
          )}
          <EditorButton onClick={onClose} variant="text" density="compact">
            Cancel
          </EditorButton>
          <EditorButton
            onClick={handleConfirmClick}
            variant="contained"
            density="compact"
            disabled={!selectedPath}
          >
            Select
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
}

export default memo(FileBrowserDialog);
