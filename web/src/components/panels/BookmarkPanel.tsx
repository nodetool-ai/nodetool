/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Button,
  Box,
  Menu,
  MenuItem,
} from "@mui/material";
import { useState, useCallback, memo } from "react";
import isEqual from "lodash/isEqual";
import { useCanvasBookmarks } from "../../hooks/useCanvasBookmarks";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Viewport } from "@xyflow/react";
import { useBookmarkPanelStore } from "../../stores/BookmarkPanelStore";

import CloseIcon from "@mui/icons-material/Close";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import NavigationIcon from "@mui/icons-material/Navigation";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ClearAllIcon from "@mui/icons-material/ClearAll";

const PANEL_HEIGHT_OPEN = 280;

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "0",
    left: "0",
    right: "0",
    zIndex: 1100,
    ".panel-container": {
      flexShrink: 0,
      position: "relative",
      backgroundColor: theme.vars.palette.background.default,
    },
    ".panel-resize-button": {
      height: "8px",
      width: "100%",
      position: "absolute",
      zIndex: 1200,
      top: "0",
      left: "0",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ns-resize",
      transition: "background-color 0.3s ease",
      "&::before": {
        content: '""',
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "40px",
        height: "4px",
        borderRadius: "2px",
        backgroundColor: theme.vars.palette.grey[600],
        opacity: 0.5,
      },
      "&:hover": {
        backgroundColor: `${theme.vars.palette.action.hover}55`,
        "&::before": {
          opacity: 0.8,
        },
      },
    },
    ".panel-content": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      border: "0",
      minHeight: 0,
    },
    ".panel-header": {
      height: "48px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "0 12px",
      backgroundColor: theme.vars.palette.background.default,
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      "& .left": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: theme.vars.palette.text.secondary,
      },
    },
    ".bookmarks-wrapper": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      overflow: "auto",
      width: "100%",
      padding: "8px 12px",
    },
    ".bookmarks-list": {
      flex: 1,
      overflow: "auto",
    },
    ".bookmark-item": {
      borderRadius: "6px",
      marginBottom: "4px",
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        border: `1px solid ${theme.vars.palette.primary.main}`,
      },
    },
    ".bookmark-name": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".bookmark-zoom": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: "24px",
    },
    ".empty-icon": {
      fontSize: "48px",
      marginBottom: "12px",
      opacity: 0.5,
    },
  });

const BookmarkPanel: React.FC = () => {
  const theme = useTheme();
  const [panelSize, setPanelSize] = useState(PANEL_HEIGHT_OPEN);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useState<HTMLDivElement | null>(null)[1];

  const isVisible = useBookmarkPanelStore((state) => state.isVisible);
  const toggleVisibility = useBookmarkPanelStore((state) => state.toggleVisibility);

  const {
    bookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    jumpToBookmark,
    saveBookmarkPosition,
    clearAllBookmarks,
  } = useCanvasBookmarks();

  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuBookmarkId, setMenuBookmarkId] = useState<string | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = panelSize;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newHeight = startHeight + (startY - moveEvent.clientY);
      if (newHeight >= 150 && newHeight <= window.innerHeight * 0.8) {
        setPanelSize(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelSize]);

  const openHeight = isVisible ? Math.min(panelSize, window.innerHeight * 0.6) : 0;

  const handleAddBookmark = useCallback(() => {
    if (newBookmarkName.trim()) {
      addBookmark(newBookmarkName.trim());
      setNewBookmarkName("");
      setIsAddingBookmark(false);
    }
  }, [newBookmarkName, addBookmark]);

  const handleEditBookmark = useCallback((bookmarkId: string, currentName: string) => {
    setEditingBookmarkId(bookmarkId);
    setEditName(currentName);
    setAnchorEl(null);
  }, []);

  const handleSaveEdit = useCallback((bookmarkId: string) => {
    if (editName.trim()) {
      updateBookmark(bookmarkId, { name: editName.trim() });
    }
    setEditingBookmarkId(null);
    setEditName("");
  }, [editName, updateBookmark]);

  const handleCancelEdit = useCallback(() => {
    setEditingBookmarkId(null);
    setEditName("");
  }, []);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, bookmarkId: string) => {
    setAnchorEl(event.currentTarget);
    setMenuBookmarkId(bookmarkId);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setMenuBookmarkId(null);
  }, []);

  const formatViewport = useCallback((viewport: Viewport) => {
    return `Zoom: ${(viewport.zoom * 100).toFixed(0)}%`;
  }, []);

  return (
    <div
      css={styles(theme)}
      className="panel-container"
      style={{
        height: openHeight,
      }}
    >
      <Drawer
        className="panel-bottom-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-bottom ${isDragging ? "dragging" : ""}`,
          style: {
            height: openHeight,
            left: "50px",
            right: "50px",
            width: "calc(100% - 100px)",
            borderWidth: isVisible ? "1px" : "0px",
            borderTop: isVisible
              ? `1px solid ${theme.vars.palette.grey[800]}`
              : "none",
            backgroundColor: theme.vars.palette.background.default,
            boxShadow: isVisible ? "0 -4px 10px rgba(0, 0, 0, 0.3)" : "none",
            overflow: "hidden",
            transition: "height 200ms ease",
          },
        }}
        variant="persistent"
        anchor="bottom"
        open={true}
      >
        <div
          className="panel-resize-button"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? "ns-resize" : "ns-resize" }}
        />
        <div className="panel-content">
          {isVisible && (
            <div className="panel-header">
              <div className="left">
                <BookmarkIcon fontSize="small" />
                <Typography variant="body2">Bookmarks</Typography>
                <Typography variant="caption" color="text.secondary">
                  ({bookmarks.length})
                </Typography>
              </div>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {bookmarks.length > 0 && (
                  <Tooltip
                    title={
                      <div className="tooltip-span">
                        <div className="tooltip-title">Clear all bookmarks</div>
                      </div>
                    }
                    placement="top-start"
                    enterDelay={TOOLTIP_ENTER_DELAY}
                  >
                    <IconButton
                      size="small"
                      onClick={clearAllBookmarks}
                      aria-label="Clear all bookmarks"
                    >
                      <ClearAllIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip
                  title={
                    <div className="tooltip-span">
                      <div className="tooltip-title">Hide bookmarks</div>
                    </div>
                  }
                  placement="top-start"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <IconButton
                    size="small"
                    onClick={toggleVisibility}
                    aria-label="Hide bookmarks"
                  >
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </div>
          )}
          <div
            className="bookmarks-wrapper"
            style={{
              display: isVisible ? "flex" : "none",
            }}
          >
            {bookmarks.length === 0 ? (
              <div className="empty-state">
                <BookmarkIcon className="empty-icon" />
                <Typography variant="body2" gutterBottom>
                  No bookmarks yet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Save your current view to quickly navigate back later
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setIsAddingBookmark(true)}
                  sx={{ mt: 2 }}
                  size="small"
                >
                  Add Bookmark
                </Button>
              </div>
            ) : (
              <>
                {isAddingBookmark && (
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      mb: 2,
                      alignItems: "center",
                    }}
                  >
                    <TextField
                      size="small"
                      placeholder="Bookmark name"
                      value={newBookmarkName}
                      onChange={(e) => setNewBookmarkName(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddBookmark()}
                      autoFocus
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddBookmark}
                      disabled={!newBookmarkName.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setIsAddingBookmark(false);
                        setNewBookmarkName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                )}
                <List className="bookmarks-list" disablePadding>
                  {bookmarks.map((bookmark) => (
                    <ListItem
                      key={bookmark.id}
                      disablePadding
                      className="bookmark-item"
                      secondaryAction={
                        editingBookmarkId === bookmark.id ? (
                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={() => handleSaveEdit(bookmark.id)}
                              aria-label="Save edit"
                            >
                              <Typography variant="caption">Save</Typography>
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={handleCancelEdit}
                              aria-label="Cancel edit"
                            >
                              <Typography variant="caption">Cancel</Typography>
                            </IconButton>
                          </Box>
                        ) : (
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, bookmark.id)}
                            aria-label="Bookmark options"
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        )
                      }
                    >
                      <ListItemButton
                        onClick={() => jumpToBookmark(bookmark.id)}
                        sx={{ borderRadius: "6px" }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <NavigationIcon fontSize="small" />
                        </ListItemIcon>
                        {editingBookmarkId === bookmark.id ? (
                          <TextField
                            size="small"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleSaveEdit(bookmark.id)}
                            autoFocus
                            sx={{ flex: 1 }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <ListItemText
                            primary={bookmark.name}
                            secondary={formatViewport(bookmark.viewport)}
                            primaryTypographyProps={{
                              className: "bookmark-name",
                              noWrap: true,
                            }}
                            secondaryTypographyProps={{
                              className: "bookmark-zoom",
                            }}
                          />
                        )}
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                >
                  <MenuItem
                    onClick={() => {
                      if (menuBookmarkId) {
                        const bookmark = bookmarks.find((b) => b.id === menuBookmarkId);
                        if (bookmark) {
                          handleEditBookmark(bookmark.id, bookmark.name);
                        }
                      }
                      handleMenuClose();
                    }}
                  >
                    <EditIcon fontSize="small" sx={{ mr: 1 }} />
                    Rename
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      if (menuBookmarkId) {
                        saveBookmarkPosition(menuBookmarkId);
                      }
                      handleMenuClose();
                    }}
                  >
                    <NavigationIcon fontSize="small" sx={{ mr: 1 }} />
                    Update Position
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      if (menuBookmarkId) {
                        removeBookmark(menuBookmarkId);
                      }
                      handleMenuClose();
                    }}
                    sx={{ color: "error.main" }}
                  >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    Delete
                  </MenuItem>
                </Menu>
              </>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default memo(BookmarkPanel, isEqual);
