import React, { useCallback, useMemo } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Tooltip,
  Collapse
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import DeleteIcon from "@mui/icons-material/Delete";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  useReactFlow,
  useViewport
} from "@xyflow/react";
import {
  useNodeBookmarkStore,
  BookmarkedNode
} from "../../stores/NodeBookmarkStore";
import { useTheme } from "@mui/material/styles";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface NodeBookmarkPanelProps {
  workflowId: string;
}

const NodeBookmarkPanel: React.FC<NodeBookmarkPanelProps> = ({
  workflowId
}) => {
  const theme = useTheme();
  const { getNode, setCenter } = useReactFlow();
  const _viewport = useViewport();
  const bookmarks = useNodeBookmarkStore((state) =>
    state.getBookmarks(workflowId)
  );
  const removeBookmark = useNodeBookmarkStore((state) => state.removeBookmark);

  const [expanded, setExpanded] = React.useState(true);

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (node) {
        const x = node.position.x + (node.measured?.width ?? 200) / 2;
        const y = node.position.y + (node.measured?.height ?? 100) / 2;
        setCenter(x, y, { zoom: 1.2, duration: 300 });
      }
    },
    [getNode, setCenter]
  );

  const handleRemoveBookmark = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      removeBookmark(workflowId, nodeId);
    },
    [removeBookmark, workflowId]
  );

  const sortedBookmarks = useMemo(() => {
    return [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
  }, [bookmarks]);

  const getNodeTitle = useCallback(
    (bookmark: BookmarkedNode) => {
      const nodeTypeParts = bookmark.nodeType.split(".");
      const nodeTypeName = nodeTypeParts.length > 1 
        ? nodeTypeParts.slice(-2).join(".") 
        : bookmark.nodeType;
      return bookmark.label || nodeTypeName || "Unknown Node";
    },
    []
  );

  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
        bgcolor: theme.vars.palette.background.paper,
        borderRadius: 2,
        boxShadow: 3,
        minWidth: 200,
        maxWidth: 280,
        overflow: "hidden"
      }}
    >
      <Box
        onClick={handleToggleExpand}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 0.75,
          bgcolor: theme.vars.palette.primary.main,
          color: theme.vars.palette.primary.contrastText,
          cursor: "pointer",
          userSelect: "none"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BookmarkIcon fontSize="small" />
          <Typography variant="subtitle2" fontWeight={600}>
            Bookmarks ({bookmarks.length})
          </Typography>
        </Box>
        {expanded ? (
          <ExpandLessIcon fontSize="small" />
        ) : (
          <ExpandMoreIcon fontSize="small" />
        )}
      </Box>
      <Collapse in={expanded}>
        <List dense disablePadding sx={{ maxHeight: 300, overflow: "auto" }}>
          {sortedBookmarks.map((bookmark) => (
            <ListItem
              key={bookmark.nodeId}
              disablePadding
              secondaryAction={
                <Tooltip title="Remove bookmark" enterDelay={TOOLTIP_ENTER_DELAY}>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => handleRemoveBookmark(e, bookmark.nodeId)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            >
              <ListItemButton
                onClick={() => handleJumpToNode(bookmark.nodeId)}
                sx={{ py: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CenterFocusStrongIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={getNodeTitle(bookmark)}
                  primaryTypographyProps={{
                    variant: "body2",
                    noWrap: true,
                    sx: { maxWidth: 150 }
                  }}
                  secondary={bookmark.nodeType.split(".").slice(-2).join(".")}
                  secondaryTypographyProps={{
                    variant: "caption",
                    noWrap: true,
                    sx: { opacity: 0.7 }
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Box>
  );
};

export default NodeBookmarkPanel;
