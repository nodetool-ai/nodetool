/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback, useState } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  TextField,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarksStore, type NodeBookmark } from "../../stores/NodeBookmarksStore";
import useMetadataStore from "../../stores/MetadataStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface BookmarksPanelProps {
  workflowId: string;
  onClose: () => void;
}

const styles = (theme: Theme) =>
  css({
    "&.bookmarks-panel": {
      position: "fixed",
      left: "20px",
      bottom: "100px",
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
      animation: "slideUp 0.2s ease-out forwards",
      "& @keyframes slideUp": {
        "0%": { opacity: 0, transform: "translateY(20px)" },
        "100%": { opacity: 1, transform: "translateY(0)" }
      }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .bookmarks-list": {
      flex: 1,
      overflowY: "auto",
      padding: "8px"
    },
    "& .bookmark-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.selected": {
        backgroundColor: `${theme.vars.palette.primary.main}15`
      }
    },
    "& .bookmark-icon-wrapper": {
      flexShrink: 0,
      color: theme.vars.palette.warning.main
    },
    "& .bookmark-info": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    "& .bookmark-label": {
      fontSize: "13px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .bookmark-node-type": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    "& .bookmark-actions": {
      flexShrink: 0
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      gap: "12px",
      color: theme.vars.palette.text.secondary
    },
    "& .empty-icon": {
      fontSize: "48px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px",
      textAlign: "center"
    }
  });

interface BookmarkMenuItem {
  bookmark: NodeBookmark;
  nodeLabel: string;
}

const BookmarksPanel: React.FC<BookmarksPanelProps> = memo(({ workflowId, onClose }) => {
  const theme = useTheme();
  const { getNode, setCenter } = useReactFlow();
  const bookmarks = useNodeBookmarksStore((state) => state.getWorkflowBookmarks(workflowId));
  const removeBookmark = useNodeBookmarksStore((state) => state.removeBookmark);
  const updateBookmarkLabel = useNodeBookmarksStore((state) => state.updateBookmarkLabel);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedBookmark, setSelectedBookmark] = useState<NodeBookmark | null>(null);

  const bookmarkItems = useMemo((): BookmarkMenuItem[] => {
    return bookmarks.map((bookmark) => {
      const node = getNode(bookmark.nodeId);
      const nodeType = node?.type || "unknown";
      const metadata = useMetadataStore.getState().getMetadata(nodeType);
      const nodeLabel = bookmark.label || metadata?.title || nodeType;

      return {
        bookmark,
        nodeLabel
      };
    });
  }, [bookmarks, getNode]);

  const handleBookmarkClick = useCallback((bookmark: NodeBookmark) => {
    const node = getNode(bookmark.nodeId);
    if (node) {
      setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 300 });
    }
  }, [getNode, setCenter]);

  const handleRemoveBookmark = useCallback((bookmark: NodeBookmark) => {
    removeBookmark(bookmark.nodeId, bookmark.workflowId);
    setMenuAnchor(null);
  }, [removeBookmark]);

  const handleStartEdit = useCallback((bookmark: NodeBookmark) => {
    setEditingId(bookmark.nodeId);
    setEditValue(bookmark.label || "");
    setMenuAnchor(null);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (selectedBookmark) {
      updateBookmarkLabel(selectedBookmark.nodeId, selectedBookmark.workflowId, editValue);
      setEditingId(null);
      setSelectedBookmark(null);
    }
  }, [selectedBookmark, editValue, updateBookmarkLabel]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
    setSelectedBookmark(null);
  }, []);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, bookmark: NodeBookmark) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedBookmark(bookmark);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setSelectedBookmark(null);
  }, []);

  return (
    <Box className="bookmarks-panel" css={styles(theme)}>
      {/* Header */}
      <Box className="panel-header">
        <Box className="panel-title">
          <BookmarkIcon fontSize="small" />
          <span>Bookmarks</span>
          <Typography
            component="span"
            sx={{
              ml: 1,
              fontSize: "11px",
              fontWeight: 400,
              color: "text.secondary"
            }}
          >
            ({bookmarks.length})
          </Typography>
        </Box>
        <Tooltip title="Close" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: "text.secondary" }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Bookmarks List */}
      <Box className="bookmarks-list">
        {bookmarkItems.length === 0 ? (
          <Box className="empty-state">
            <BookmarkBorderIcon className="empty-icon" />
            <Typography className="empty-text">
              No bookmarks yet.<br />
              Press <strong>B</strong> on a selected node to add one.
            </Typography>
          </Box>
        ) : (
          bookmarkItems.map(({ bookmark, nodeLabel }) => (
            <Box
              key={bookmark.nodeId}
              className="bookmark-item"
              onClick={() => handleBookmarkClick(bookmark)}
            >
              <Box className="bookmark-icon-wrapper">
                <BookmarkIcon fontSize="small" />
              </Box>

              {editingId === bookmark.nodeId ? (
                <TextField
                  size="small"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                  autoFocus
                  fullWidth
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    flex: 1,
                    "& .MuiInputBase-input": {
                      fontSize: "13px",
                      padding: "4px 8px"
                    }
                  }}
                />
              ) : (
                <>
                  <Box className="bookmark-info">
                    <Typography className="bookmark-label">
                      {nodeLabel}
                    </Typography>
                    <Typography className="bookmark-node-type">
                      {bookmark.nodeId}
                    </Typography>
                  </Box>

                  <Box className="bookmark-actions">
                    <Tooltip title="More options" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuOpen(e, bookmark)}
                        sx={{ color: "text.secondary" }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              minWidth: 180
            }
          }
        }}
      >
        {selectedBookmark && (
          <>
            <MenuItem onClick={() => handleStartEdit(selectedBookmark)}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rename Bookmark</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleRemoveBookmark(selectedBookmark)}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Remove Bookmark</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
});

BookmarksPanel.displayName = "BookmarksPanel";

export default BookmarksPanel;
