/**
 * BookmarksPanel
 *
 * A panel component that displays all bookmarked nodes in the current workflow.
 * Users can quickly navigate to bookmarked nodes by clicking on them.
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  IconButton,
  Tooltip,
  SxProps,
  Theme
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNodeBookmarksStore, NodeBookmark } from "../../stores/NodeBookmarksStore";
import { useReactFlow } from "@xyflow/react";


interface BookmarksPanelProps {
  sx?: SxProps<Theme>;
  emptyMessage?: string;
}

const EmptyState = memo(({ message }: { message: string }) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "text.secondary",
        px: 3,
        textAlign: "center"
      }}
    >
      <BookmarkIcon
        sx={{
          fontSize: 48,
          mb: 2,
          opacity: 0.3
        }}
      />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
});

EmptyState.displayName = "EmptyState";

const BookmarkListItem = memo(({
  bookmark,
  onNavigate,
  onRemove
}: {
  bookmark: NodeBookmark;
  onNavigate: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
}) => {
  const handleNavigate = useCallback(() => {
    onNavigate(bookmark.nodeId);
  }, [bookmark.nodeId, onNavigate]);

  const handleRemove = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onRemove(bookmark.nodeId);
  }, [bookmark.nodeId, onRemove]);

  const displayNodeType = useMemo(() => {
    return bookmark.nodeType.split(".").pop() || bookmark.nodeType;
  }, [bookmark.nodeType]);

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Tooltip title="Remove bookmark" placement="left">
          <IconButton
            edge="end"
            size="small"
            onClick={handleRemove}
            sx={{ ml: 1 }}
            aria-label="Remove bookmark"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    >
      <ListItemButton
        onClick={handleNavigate}
        dense
        sx={{
          borderRadius: 1,
          mx: 1,
          my: 0.5,
          "&:hover": {
            backgroundColor: "action.hover"
          }
        }}
      >
        <ListItemIcon>
          <BookmarkIcon
            fontSize="small"
            sx={{ color: "warning.main" }}
          />
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {bookmark.nodeName}
            </Typography>
          }
          secondary={
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {displayNodeType}
            </Typography>
          }
        />
      </ListItemButton>
    </ListItem>
  );
});

BookmarkListItem.displayName = "BookmarkListItem";

const BookmarksPanel: React.FC<BookmarksPanelProps> = memo(({
  sx,
  emptyMessage = "No bookmarks yet. Click the bookmark icon on any node to save it here."
}) => {
  const bookmarks = useNodeBookmarksStore((state) => state.bookmarks);
  const removeBookmark = useNodeBookmarksStore((state) => state.removeBookmark);
  const reactFlowInstance = useReactFlow();

  const handleNavigate = useCallback((nodeId: string) => {
    const node = reactFlowInstance.getNode(nodeId);
    if (node) {
      // Center the view on the node
      reactFlowInstance.setCenter(
        node.position.x + (node.width?.valueOf() ?? 200) / 2,
        node.position.y + (node.height?.valueOf() ?? 100) / 2,
        { zoom: 1, duration: 300 }
      );
      
      // Select the node
      reactFlowInstance.setNodes((nodes) =>
        nodes.map((n) => ({
          ...n,
          selected: n.id === nodeId
        }))
      );
    }
  }, [reactFlowInstance]);

  const handleRemove = useCallback((nodeId: string) => {
    removeBookmark(nodeId);
  }, [removeBookmark]);

  if (bookmarks.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", ...sx }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {bookmarks.length} {bookmarks.length === 1 ? "bookmark" : "bookmarks"}
        </Typography>
      </Box>
      <Divider />
      <List
        dense
        sx={{
          flex: 1,
          overflow: "auto",
          px: 0
        }}
      >
        {bookmarks.map((bookmark) => (
          <BookmarkListItem
            key={bookmark.nodeId}
            bookmark={bookmark}
            onNavigate={handleNavigate}
            onRemove={handleRemove}
          />
        ))}
      </List>
    </Box>
  );
});

BookmarksPanel.displayName = "BookmarksPanel";

export default BookmarksPanel;
