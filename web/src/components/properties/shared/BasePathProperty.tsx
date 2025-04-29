/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useEffect, useState } from "react";
import { isEqual } from "lodash";
import { useQuery } from "@tanstack/react-query";
import log from "loglevel";
import PropertyLabel from "../../node/PropertyLabel";
import { FileInfo } from "../../../stores/ApiTypes";
import { PropertyProps } from "../../node/PropertyInput";
import { client } from "../../../stores/ApiClient";
import { createErrorMessage } from "../../../utils/errorHandling";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from "@mui/material";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";

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

export type PathType = "file_path" | "folder_path";

interface PathDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  files: TreeViewItem[];
  selectedPath: string;
  isLoading: boolean;
  onItemClick: (event: React.MouseEvent, itemId: string) => void;
}

interface PathPreviewProps {
  value?: { path: string };
  onBrowseClick: () => void;
  onClear: () => void;
  ariaLabel: string;
}

interface BasePathPropertyProps extends PropertyProps {
  pathType: PathType;
  dialogTitle: string;
  onlyDirs: boolean;
}

// Styles
const createPathPropertyStyles = (theme: any) =>
  css([
    {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",

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

      ".path-picker__inputs": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "20px",
        flex: 1
      },

      ".path-picker__browse-button": {
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

      ".path-picker__preview": {
        color: theme.palette.c_gray4,
        display: "flex",
        alignItems: "center",
        flex: 1,
        marginLeft: "8px",
        wordBreak: "break-all",
        minHeight: "20px"
      },

      ".path-picker__reset-button": {
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

const treeViewStyles = (theme: any) => ({
  ".MuiTreeItem-content": {
    borderRadius: "2px",
    padding: "2px 4px 2px 0",
    userSelect: "none"
  },
  ".MuiTreeItem-content.Mui-selected": {
    backgroundColor: (theme: any) => `${theme.palette.c_hl1} !important`,
    color: (theme: any) => theme.palette.c_black
  },
  ".MuiTreeItem-content:hover": {
    backgroundColor: (theme: any) => `${theme.palette.c_gray3} !important`
  },
  ".MuiTreeItem-content.Mui-selected:hover": {
    opacity: 0.8,
    backgroundColor: (theme: any) => `${theme.palette.c_hl1} !important`
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
    color: (theme: any) => theme.palette.c_warning
  },
  ".loading-item .MuiTreeItem-label": {
    color: (theme: any) => theme.palette.c_gray3
  }
});

// Utils
const createErrorItem = (itemId: string): TreeViewItem => ({
  id: `${itemId}/error`,
  label: "⚠️ Access denied",
  children: undefined,
  className: "error-item"
});

const fileToTreeItem = (
  file: FileInfo,
  onlyDirs: boolean = false
): TreeViewItem | null => {
  if (onlyDirs && !file.is_dir) return null;

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
        id: file.path + "/",
        label: "loading...",
        className: "loading-item",
        children: []
      }
    ];
  }

  return item;
};

const fetchFiles = async (
  path: string,
  onlyDirs: boolean = false
): Promise<TreeViewItem[]> => {
  const { data, error } = await client.GET("/api/files/list", {
    params: { query: { path } }
  });

  if (error) {
    throw createErrorMessage(
      error,
      onlyDirs ? "Failed to list folders" : "Failed to list files"
    );
  }

  return data
    .map((file: FileInfo) => fileToTreeItem(file, onlyDirs))
    .filter((item: TreeViewItem | null): item is TreeViewItem => item !== null);
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

// Components
const PathPreview = ({
  value,
  onBrowseClick,
  onClear,
  ariaLabel
}: PathPreviewProps) => {
  return (
    <div className="path-picker__inputs">
      <button onClick={onBrowseClick} className="path-picker__browse-button">
        Browse
      </button>
      <div className="path-picker__preview">
        <Typography>{value?.path}</Typography>
        {value?.path && (
          <button
            onClick={onClear}
            className="path-picker__reset-button"
            aria-label={ariaLabel}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

const PathDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  files,
  selectedPath,
  isLoading,
  onItemClick
}: PathDialogProps) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
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
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Typography>Loading files...</Typography>
        ) : (
          <RichTreeView
            className="file-browser"
            onItemClick={onItemClick}
            items={files ?? []}
            aria-label="file browser"
            selectedItems={selectedPath}
            sx={treeViewStyles}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const BasePathProperty = (props: BasePathPropertyProps) => {
  const id = `${props.pathType}-${props.property.name}-${props.propertyIndex}`;
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const { data: initialFiles, isLoading: isInitialLoading } = useQuery({
    queryKey: ["files", "~"],
    queryFn: () => fetchFiles("~", props.onlyDirs),
    enabled: isFileBrowserOpen
  });

  const [files, setFiles] = useState<TreeViewItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>(
    props.value?.path || ""
  );

  useEffect(() => {
    if (initialFiles) {
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  const handleItemClick = useCallback(
    async (event: React.MouseEvent, itemId: string) => {
      setSelectedPath(itemId);
      try {
        const targetItem = findItemInTree(files, itemId);
        if (shouldLoadChildren(targetItem)) {
          const children = await fetchFiles(itemId, props.onlyDirs);
          setFiles((currentFiles) =>
            updateTreeWithChildren(currentFiles, itemId, children)
          );
        }
      } catch (error) {
        log.error(`${props.pathType}: Failed to load children:`, error);
        setFiles((currentFiles) =>
          updateTreeWithChildren(currentFiles, itemId, [
            createErrorItem(itemId)
          ])
        );
      }
    },
    [files, props.onlyDirs, props.pathType]
  );

  const handleBrowseClick = useCallback(() => {
    setIsFileBrowserOpen(true);
  }, []);

  const handleClear = useCallback(() => {
    props.onChange({ type: props.pathType, path: "" });
  }, [props]);

  const handleConfirm = useCallback(() => {
    props.onChange({ type: props.pathType, path: selectedPath });
    setIsFileBrowserOpen(false);
  }, [props, selectedPath]);

  const handleCancel = useCallback(() => {
    setSelectedPath(props.value?.path || "");
    setIsFileBrowserOpen(false);
  }, [props.value?.path]);

  return (
    <div css={createPathPropertyStyles} className="path-picker">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      <PathPreview
        value={props.value}
        onBrowseClick={handleBrowseClick}
        onClear={handleClear}
        ariaLabel={`Clear ${props.pathType.split("_")[0]} selection`}
      />

      <PathDialog
        open={isFileBrowserOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={props.dialogTitle}
        files={files}
        selectedPath={selectedPath}
        isLoading={isInitialLoading}
        onItemClick={handleItemClick}
      />
    </div>
  );
};

export default memo(BasePathProperty, isEqual);
