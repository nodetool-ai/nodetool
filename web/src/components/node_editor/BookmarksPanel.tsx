/**
 * BookmarksPanel Component
 *
 * Side panel displaying bookmarked/pinned nodes for quick navigation.
 * Shows a list of all bookmarked nodes in the current workflow with
 * one-click navigation to each node.
 */

import React, { useCallback, memo, useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  TextField,
  Chip
} from "@mui/material";
import {
  Bookmark as BookmarkIcon,
  BookmarkBorder as BookmarkBorderIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodeBookmarksStore, type NodeBookmark } from "../../stores/NodeBookmarksStore";
import { useNodes } from "../../contexts/NodeContext";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useReactFlow } from "@xyflow/react";
import PanelHeadline from "../ui/PanelHeadline";

interface BookmarksPanelProps {
  workflowId: string;
}

const styles = (theme: Theme) => ({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: theme.vars.palette.background.default
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    py: 1
  },
  listItem: {
    borderRadius: theme.spacing(0.75),
    mx: 1,
    mb: 0.5,
    backgroundColor: theme.vars.palette.action.hover,
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.selected
    }
  },
  listItemButton: {
    borderRadius: theme.spacing(0.75),
    py: 1
  },
  nodeName: {
    fontSize: "0.875rem",
    fontWeight: 500
  },
  nodeType: {
    fontSize: "0.75rem",
    color: theme.vars.palette.text.secondary
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    px: 3,
    textAlign: "center" as const,
    color: theme.vars.palette.text.secondary
  },
  emptyIcon: {
    fontSize: "3rem",
    mb: 2,
    opacity: 0.5
  }
});

/**
 * BookmarkListItem Component
 *
 * Represents a single bookmarked node in the bookmarks list.
 * Supports inline editing of bookmark names and quick navigation.
 */
interface BookmarkListItemProps {
  bookmark: NodeBookmark;
  nodeName: string;
  nodeType: string;
  onNavigate: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
  onRename: (nodeId: string, newName: string) => void;
}

const BookmarkListItem: React.FC<BookmarkListItemProps> = memo(({
  bookmark,
  nodeName,
  nodeType,
  onNavigate,
  onRemove,
  onRename
}) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(bookmark.name || nodeName);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setEditValue(bookmark.name || nodeName);
  }, [bookmark.name, nodeName]);

  const handleSaveEdit = useCallback(() => {
    if (editValue.trim()) {
      onRename(bookmark.nodeId, editValue.trim());
    }
    setIsEditing(false);
  }, [bookmark.nodeId, editValue, onRename]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(bookmark.name || nodeName);
  }, [bookmark.name, nodeName]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const displayName = bookmark.name || nodeName;

  return (
    <ListItem
      disablePadding
      sx={styles(theme).listItem}
      secondaryAction={
        <Box sx={{ display: "flex", gap: 0.25 }}>
          {isEditing ? (
            <>
              <Tooltip title="Save">
                <IconButton
                  size="small"
                  onClick={handleSaveEdit}
                  sx={{ color: "success.main" }}
                >
                  <CheckIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel">
                <IconButton
                  size="small"
                  onClick={handleCancelEdit}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="Rename bookmark">
                <IconButton
                  size="small"
                  onClick={handleStartEdit}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove bookmark">
                <IconButton
                  size="small"
                  onClick={() => onRemove(bookmark.nodeId)}
                  sx={{ color: "error.main" }}
                >
                  <BookmarkIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      }
    >
      <ListItemButton
        onClick={() => onNavigate(bookmark.nodeId)}
        disabled={isEditing}
        sx={styles(theme).listItemButton}
      >
        <ListItemIcon>
          <BookmarkIcon sx={{ color: "primary.main" }} />
        </ListItemIcon>
        {isEditing ? (
          <TextField
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            autoFocus
            size="small"
            fullWidth
            sx={{
              "& .MuiInputBase-root": {
                fontSize: "0.875rem",
                py: 0.5
              }
            }}
          />
        ) : (
          <ListItemText
            primary={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={styles(theme).nodeName}>
                  {displayName}
                </Typography>
                {bookmark.name && (
                  <Tooltip title="Custom bookmark name">
                    <Chip
                      label="Custom"
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: "0.65rem",
                        backgroundColor: theme.vars.palette.primary.main,
                        color: theme.vars.palette.primary.contrastText
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
            }
            secondary={
              <Typography sx={styles(theme).nodeType}>
                {nodeType}
              </Typography>
            }
          />
        )}
      </ListItemButton>
    </ListItem>
  );
});

BookmarkListItem.displayName = "BookmarkListItem";

/**
 * BookmarksPanel Component
 *
 * Displays all bookmarked nodes for the current workflow.
 * Provides quick navigation, renaming, and removal of bookmarks.
 *
 * @example
 * ```tsx
 * <BookmarksPanel workflowId={workflowId} />
 * ```
 */
export const BookmarksPanel: React.FC<BookmarksPanelProps> = ({ workflowId }) => {
  const theme = useTheme();
  const reactFlowInstance = useReactFlow();
  const bookmarks = useNodeBookmarksStore((state) => state.getWorkflowBookmarks(workflowId));
  const removeBookmark = useNodeBookmarksStore((state) => state.removeBookmark);
  const renameBookmark = useNodeBookmarksStore((state) => state.renameBookmark);
  const nodes = useNodes((state) => state.nodes);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);

  // Create a map of node IDs to node data for quick lookup
  const nodeMap = useMemo(() => {
    return new Map(nodes.map((node: Node<NodeData>) => [node.id, node]));
  }, [nodes]);

  // Filter bookmarks to only include nodes that still exist
  const validBookmarks = useMemo(() => {
    return bookmarks.filter((bookmark) => nodeMap.has(bookmark.nodeId));
  }, [bookmarks, nodeMap]);

  const handleNavigate = useCallback((nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (node && reactFlowInstance) {
      // Center the viewport on the node
      const { x, y } = node.position;
      const zoom = reactFlowInstance.getZoom();
      reactFlowInstance.setCenter(x, y, { zoom, duration: 300 });

      // Select the node
      setSelectedNodes([node]);
    }
  }, [nodeMap, reactFlowInstance, setSelectedNodes]);

  const handleRemove = useCallback((nodeId: string) => {
    removeBookmark(workflowId, nodeId);
  }, [workflowId, removeBookmark]);

  const handleRename = useCallback((nodeId: string, newName: string) => {
    renameBookmark(workflowId, nodeId, newName);
  }, [workflowId, renameBookmark]);

  if (validBookmarks.length === 0) {
    return (
      <Box sx={styles(theme).root}>
        <PanelHeadline title="Bookmarks" />
        <Box sx={styles(theme).emptyState}>
          <BookmarkBorderIcon sx={styles(theme).emptyIcon} />
          <Typography variant="body2" sx={{ mb: 1 }}>
            No bookmarks yet
          </Typography>
          <Typography variant="caption">
            Right-click a node and select &quot;Add Bookmark&quot; to save important nodes for quick access.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={styles(theme).root}>
      <PanelHeadline title="Bookmarks" />
      <List sx={styles(theme).list}>
        {validBookmarks.map((bookmark) => {
          const node = nodeMap.get(bookmark.nodeId);
          if (!node) {
            return null;
          }

          // Extract a readable node type from the full type string
          const nodeType = node.type?.split(".").pop() || "Unknown";

          return (
            <BookmarkListItem
              key={bookmark.nodeId}
              bookmark={bookmark}
              nodeName={(node.data as NodeData).title || nodeType}
              nodeType={nodeType}
              onNavigate={handleNavigate}
              onRemove={handleRemove}
              onRename={handleRename}
            />
          );
        })}
      </List>
    </Box>
  );
};

export default memo(BookmarksPanel);
