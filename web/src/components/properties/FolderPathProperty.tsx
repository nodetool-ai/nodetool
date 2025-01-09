/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useEffect, useState } from "react";
import { PropertyProps } from "../node/PropertyInput";
import {
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box
} from "@mui/material";
import { isEqual } from "lodash";
import PropertyLabel from "../node/PropertyLabel";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import { FileInfo } from "../../stores/ApiTypes";

interface TreeViewItem {
  id: string;
  label: string;
  children?: TreeViewItem[];
}

const styles = (theme: any) =>
  css([
    {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",

      ".folder-picker__inputs": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "20px",
        flex: 1
      },

      ".file-browser": {
        maxHeight: "300px",
        overflowY: "auto",
        border: `1px solid ${theme.palette.c_gray2}`,
        borderRadius: "4px",
        padding: "8px",
        marginTop: "0.5em"
      },

      ".folder-picker__browse-button": {
        backgroundColor: theme.palette.c_gray2,
        border: `1px solid ${theme.palette.c_gray3}`,
        borderRadius: "4px",
        color: theme.palette.common.white,
        cursor: "pointer",
        padding: "2px 4px",
        height: "100%",
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: theme.palette.c_gray3
        }
      },

      ".folder-picker__preview": {
        color: theme.palette.c_gray4,
        display: "flex",
        alignItems: "center",
        flex: 1,
        marginLeft: "8px",
        wordBreak: "break-all",
        minHeight: "20px"
      },

      ".folder-picker__reset-button": {
        backgroundColor: "transparent",
        border: "none",
        borderRadius: "50%",
        color: theme.palette.c_gray4,
        cursor: "pointer",
        padding: "4px 8px",
        minWidth: "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s ease",
        "&:hover": {
          color: theme.palette.c_hl1
        }
      },

      ".modal-actions": {
        display: "flex",
        justifyContent: "flex-end",
        gap: "1em",
        marginTop: "1em"
      },

      ".MuiDialog-paper": {
        borderRadius: "8px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.24)"
      },

      ".MuiDialogTitle-root": {
        borderBottom: `1px solid ${theme.palette.c_gray3}`,
        padding: "16px 24px"
      },

      ".MuiDialogContent-root": {
        padding: "24px",
        minHeight: "400px"
      },

      ".MuiDialogActions-root": {
        borderTop: `1px solid ${theme.palette.c_gray3}`,
        padding: "16px 24px",
        margin: 0
      }
    }
  ]);

const fileToTreeItem = (file: FileInfo): TreeViewItem | null => {
  if (!file.is_dir) return null;
  return {
    id: file.path,
    label: file.name,
    children: [{ id: file.path + "/", label: "loading...", children: [] }]
  };
};

const fetchFiles = async (path: string): Promise<TreeViewItem[]> => {
  const { data, error } = await client.GET("/api/files/list", {
    params: { query: { path } }
  });

  if (error) {
    throw createErrorMessage(error, "Failed to list folders");
  }

  return data
    .map(fileToTreeItem)
    .filter((item): item is TreeViewItem => item !== null);
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

const FolderPathProperty = (props: PropertyProps) => {
  const id = `folder-path-${props.property.name}-${props.propertyIndex}`;
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  // Change to use state for files instead of just query
  const { data: initialFiles, isLoading: isInitialLoading } = useQuery({
    queryKey: ["files", "~"],
    queryFn: () => fetchFiles("~"),
    enabled: isFileBrowserOpen
  });

  // Add state to track loaded files
  const [files, setFiles] = useState<TreeViewItem[]>([]);

  // Update files when initial load completes
  useEffect(() => {
    if (initialFiles) {
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  const [selectedPath, setSelectedPath] = useState<string>(
    props.value?.path || ""
  );

  const handleItemClick = useCallback(
    async (event: React.MouseEvent, itemId: string) => {
      setSelectedPath(itemId);
      try {
        const targetItem = findItemInTree(files, itemId);
        if (shouldLoadChildren(targetItem)) {
          const children = await fetchFiles(itemId);
          setFiles((currentFiles) =>
            updateTreeWithChildren(currentFiles, itemId, children)
          );
        }
      } catch (error) {
        console.error("Failed to load children:", error);
      }
    },
    [files]
  );

  const handleBrowseClick = useCallback(() => {
    setIsFileBrowserOpen(true);
  }, []);

  const handleClear = useCallback(() => {
    props.onChange({ type: "folder_path", path: "" });
  }, [props.onChange]);

  const handleConfirm = useCallback(() => {
    props.onChange({ type: "folder_path", path: selectedPath });
    setIsFileBrowserOpen(false);
  }, [props.onChange, selectedPath]);

  const handleCancel = useCallback(() => {
    setSelectedPath(props.value?.path || "");
    setIsFileBrowserOpen(false);
  }, [props.value?.path]);

  return (
    <div css={styles} className="folder-picker">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      <div className="folder-picker__inputs">
        <button
          onClick={handleBrowseClick}
          className="folder-picker__browse-button"
        >
          Browse
        </button>
        <div className="folder-picker__preview">
          <Typography>{props.value?.path}</Typography>
          {props.value?.path && (
            <button
              onClick={handleClear}
              className="folder-picker__reset-button"
              aria-label="Clear file selection"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <Dialog
        open={isFileBrowserOpen}
        onClose={handleCancel}
        aria-labelledby="file-browser-dialog"
        maxWidth="md"
        fullWidth
        BackdropProps={{
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(4px)"
          }
        }}
      >
        <DialogTitle>Select Folder</DialogTitle>
        <DialogContent>
          {isInitialLoading ? (
            <Typography>Loading files...</Typography>
          ) : (
            <RichTreeView
              className="file-browser"
              onItemClick={handleItemClick}
              items={files ?? []}
              aria-label="file browser"
              selectedItems={selectedPath}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleConfirm} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default memo(FolderPathProperty, isEqual);
