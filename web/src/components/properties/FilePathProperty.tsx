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
import { devError } from "../../utils/DevLog";

interface TreeViewItem {
  id: string;
  label: string;
  className?: string;
  children?: TreeViewItem[];
  itemProps?: Record<string, any>;
  treeItemProps?: Record<string, any>;
  style?: Record<string, string>;
}

const styles = (theme: any) =>
  css([
    {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",

      ".file-picker__inputs": {
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
        borderRadius: "2px",
        padding: "8px",
        marginTop: "0.5em",

        ".error-item > .MuiTreeItem-content": {
          backgroundColor: `${theme.palette.c_warning} !important`
        }
      },

      ".file-picker__browse-button": {
        backgroundColor: theme.palette.c_gray2,
        border: `1px solid ${theme.palette.c_gray3}`,
        borderRadius: "2px",
        color: theme.palette.common.white,
        cursor: "pointer",
        padding: "2px 4px",
        height: "100%",
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: theme.palette.c_gray3
        }
      },

      ".file-picker__preview": {
        color: theme.palette.c_gray4,
        display: "flex",
        alignItems: "center",
        flex: 1,
        marginLeft: "8px",
        wordBreak: "break-all",
        minHeight: "20px"
      },

      ".file-picker__reset-button": {
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
        backgroundColor: theme.palette.c_gray1,
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

const fileToTreeItem = (file: FileInfo): TreeViewItem => {
  const item = {
    id: file.path,
    label: file.name,
    treeItemProps: {
      className: file.is_dir ? "folder-item" : "file-item"
    },
    children: file.is_dir
      ? [
          {
            id: file.path + "/",
            label: "loading...",
            className: "loading-item",
            children: []
          }
        ]
      : undefined
  };
  return item;
};

const fetchFiles = async (path: string): Promise<TreeViewItem[]> => {
  const { data, error } = await client.GET("/api/files/list", {
    params: { query: { path } }
  });

  if (error) {
    throw createErrorMessage(error, "Failed to list files");
  }

  return data.map(fileToTreeItem);
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

const FilePathProperty = (props: PropertyProps) => {
  const id = `file-path-${props.property.name}-${props.propertyIndex}`;
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
        devError("FilePathProperty: Failed to load children:", error);
        const errorItem = {
          id: `${itemId}/error`,
          label: "⚠️ Access denied",
          children: undefined,
          className: "error-item"
        };
        setFiles((currentFiles) =>
          updateTreeWithChildren(currentFiles, itemId, [errorItem])
        );
      }
    },
    [files]
  );

  const handleBrowseClick = useCallback(() => {
    setIsFileBrowserOpen(true);
  }, []);

  const handleClear = useCallback(() => {
    props.onChange({ type: "file_path", path: "" });
  }, [props.onChange]);

  const handleConfirm = useCallback(() => {
    props.onChange({ type: "file_path", path: selectedPath });
    setIsFileBrowserOpen(false);
  }, [props.onChange, selectedPath]);

  const handleCancel = useCallback(() => {
    setSelectedPath(props.value?.path || "");
    setIsFileBrowserOpen(false);
  }, [props.value?.path]);

  return (
    <div css={styles} className="file-picker">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      <div className="file-picker__inputs">
        <button
          onClick={handleBrowseClick}
          className="file-picker__browse-button"
        >
          Browse
        </button>
        <div className="file-picker__preview">
          <Typography>{props.value?.path}</Typography>
          {props.value?.path && (
            <button
              onClick={handleClear}
              className="file-picker__reset-button"
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
        PaperProps={{
          sx: {
            backgroundColor: (theme) => theme.palette.c_gray0,
            borderRadius: "8px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.24)"
          }
        }}
      >
        <DialogTitle>Select File</DialogTitle>
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
              sx={{
                ".MuiTreeItem-content": {
                  borderRadius: "2px",
                  padding: "2px 4px 2px 0",
                  userSelect: "none"
                },
                ".MuiTreeItem-content.Mui-selected": {
                  backgroundColor: (theme) =>
                    `${theme.palette.c_hl1} !important`,
                  color: (theme) => theme.palette.c_black
                },
                ".MuiTreeItem-content:hover": {
                  backgroundColor: (theme) =>
                    `${theme.palette.c_gray3} !important`
                },
                ".MuiTreeItem-content.Mui-selected:hover": {
                  opacity: 0.8,
                  backgroundColor: (theme) =>
                    `${theme.palette.c_hl1} !important`
                },
                ".MuiTreeItem-label": {
                  backgroundColor: "transparent !important",
                  fontWeight: 300
                },
                ".MuiTreeItem-content:has(.MuiTreeItem-iconContainer svg) .MuiTreeItem-label":
                  {
                    fontWeight: 700
                  },
                "[id$='/error'] .MuiTreeItem-content": {
                  color: (theme) => theme.palette.c_warning
                },
                ".loading-item .MuiTreeItem-label": {
                  color: (theme) => theme.palette.c_gray3
                }
              }}
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

export default memo(FilePathProperty, isEqual);
