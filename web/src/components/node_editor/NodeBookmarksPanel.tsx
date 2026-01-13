/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useReactFlow } from "@xyflow/react";
import {
  useNodeBookmarkStore,
  NodeBookmark
} from "../../stores/NodeBookmarkStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    "&.bookmarks-panel": {
      position: "fixed",
      top: "80px",
      left: "60px",
      width: "280px",
      maxHeight: "400px",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "@keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(-20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      maxHeight: "320px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "48px",
      opacity: 0.3,
      marginBottom: "12px"
    },
    "& .bookmark-item": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      }
    },
    "& .bookmark-button": {
      padding: "8px 12px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .bookmark-label": {
      fontSize: "13px",
      fontWeight: 500
    },
    "& .bookmark-type": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      textTransform: "lowercase"
    },
    "& .delete-button": {
      opacity: 0,
      transition: "opacity 0.15s ease"
    },
    "& .bookmark-item:hover .delete-button": {
      opacity: 1
    }
  });

interface NodeBookmarksPanelProps {
  workflowId: string;
  onClose: () => void;
}

const NodeBookmarksPanel: React.FC<NodeBookmarksPanelProps> = memo(
  ({ workflowId, onClose }) => {
    const theme = useTheme();
    const { getNode, setCenter } = useReactFlow();
    const bookmarks = useNodeBookmarkStore((state) =>
      state.getBookmarks(workflowId)
    );
    const removeBookmark = useNodeBookmarkStore(
      (state) => state.removeBookmark
    );

    const handleNavigate = useCallback(
      (bookmark: NodeBookmark) => {
        const node = getNode(bookmark.nodeId);
        if (node) {
          setCenter(node.position.x + 100, node.position.y + 50, {
            zoom: 1.2,
            duration: 300
          });
        }
      },
      [getNode, setCenter]
    );

    const handleRemove = useCallback(
      (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        removeBookmark(workflowId, nodeId);
      },
      [removeBookmark, workflowId]
    );

    const formatNodeType = (nodeType: string): string => {
      const parts = nodeType.split(".");
      return parts[parts.length - 1] || nodeType;
    };

    return (
      <Box className="bookmarks-panel" css={styles(theme)}>
        <Box className="panel-header">
          <Box className="panel-title">
            <BookmarkIcon fontSize="small" />
            <span>Bookmarks ({bookmarks.length})</span>
          </Box>
          <Tooltip title="Close" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box className="panel-content">
          {bookmarks.length === 0 ? (
            <Box className="empty-state">
              <BookmarkBorderIcon className="empty-icon" />
              <Typography variant="body2">No bookmarks yet</Typography>
              <Typography variant="caption" sx={{ mt: 1, opacity: 0.7 }}>
                Press Ctrl+B to bookmark selected nodes
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {bookmarks.map((bookmark) => (
                <ListItem
                  key={bookmark.nodeId}
                  className="bookmark-item"
                  disablePadding
                  secondaryAction={
                    <Tooltip
                      title="Remove bookmark"
                      arrow
                      enterDelay={TOOLTIP_ENTER_DELAY}
                    >
                      <IconButton
                        className="delete-button"
                        size="small"
                        onClick={(e) => handleRemove(e, bookmark.nodeId)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemButton
                    className="bookmark-button"
                    onClick={() => handleNavigate(bookmark)}
                  >
                    <ListItemText
                      primary={
                        <Typography className="bookmark-label">
                          {bookmark.label || "Unnamed Node"}
                        </Typography>
                      }
                      secondary={
                        <Typography className="bookmark-type">
                          {formatNodeType(bookmark.nodeType)}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    );
  }
);

NodeBookmarksPanel.displayName = "NodeBookmarksPanel";

export default NodeBookmarksPanel;
