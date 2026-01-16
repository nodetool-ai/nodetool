/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  TextField,
  Tooltip,
  Typography,
  Paper,
  Divider
} from "@mui/material";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import BookmarkRemoveIcon from "@mui/icons-material/BookmarkRemove";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import EditIcon from "@mui/icons-material/Edit";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { useReactFlow, Viewport } from "@xyflow/react";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useBookmarkStore, WorkflowBookmark } from "../../stores/BookmarkStore";

const styles = (theme: Theme) =>
  css({
    ".bookmark-panel": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: 280,
      maxWidth: 320,
      backgroundColor: theme.vars.palette.background.paper,
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    ".bookmark-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".bookmark-header-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      fontWeight: 600,
      fontSize: "0.875rem"
    },
    ".bookmark-actions": {
      display: "flex",
      gap: theme.spacing(0.5)
    },
    ".bookmark-list": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(1)
    },
    ".bookmark-item": {
      marginBottom: theme.spacing(1),
      borderRadius: theme.shape.borderRadius,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".bookmark-item-active": {
      borderColor: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.action.selected
    },
    ".bookmark-color-indicator": {
      width: 8,
      height: "100%",
      borderRadius: 4,
      marginRight: theme.spacing(1)
    },
    ".bookmark-item-content": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(1),
      gap: theme.spacing(0.5)
    },
    ".bookmark-item-name": {
      fontWeight: 500,
      fontSize: "0.875rem",
      wordBreak: "break-word"
    },
    ".bookmark-item-zoom": {
      fontSize: "0.75rem",
      opacity: 0.7
    },
    ".bookmark-item-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: theme.spacing(0.5),
      marginTop: theme.spacing(0.5)
    },
    ".bookmark-empty": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: theme.spacing(3),
      textAlign: "center",
      opacity: 0.6
    },
    ".add-bookmark-form": {
      padding: theme.spacing(1.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    ".navigation-controls": {
      display: "flex",
      justifyContent: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    }
  });

interface BookmarkPanelProps {
  onNavigateToViewport?: (viewport: Viewport) => void;
}

const BookmarkPanel: React.FC<BookmarkPanelProps> = ({
  onNavigateToViewport
}) => {
  const theme = useTheme();
  const { getViewport } = useReactFlow();

  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  const currentBookmarkId = useBookmarkStore((state) => state.currentBookmarkId);
  const addBookmark = useBookmarkStore((state) => state.addBookmark);
  const removeBookmark = useBookmarkStore((state) => state.removeBookmark);
  const updateBookmark = useBookmarkStore((state) => state.updateBookmark);
  const navigateToBookmark = useBookmarkStore((state) => state.navigateToBookmark);
  const setCurrentBookmark = useBookmarkStore((state) => state.setCurrentBookmark);

  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAddBookmark = useCallback(() => {
    const viewport = getViewport();
    const name = newBookmarkName.trim() || `Bookmark ${bookmarks.length + 1}`;
    addBookmark(name, viewport);
    setNewBookmarkName("");
  }, [newBookmarkName, bookmarks.length, addBookmark, getViewport]);

  const handleNavigateToBookmark = useCallback((bookmark: WorkflowBookmark) => {
    onNavigateToViewport?.(bookmark.viewport);
    setCurrentBookmark(bookmark.id);
  }, [onNavigateToViewport, setCurrentBookmark]);

  const handleNavigateNext = useCallback(() => {
    const bookmark = navigateToBookmark("next");
    if (bookmark) {
      onNavigateToViewport?.(bookmark.viewport);
    }
  }, [navigateToBookmark, onNavigateToViewport]);

  const handleNavigatePrev = useCallback(() => {
    const bookmark = navigateToBookmark("prev");
    if (bookmark) {
      onNavigateToViewport?.(bookmark.viewport);
    }
  }, [navigateToBookmark, onNavigateToViewport]);

  const handleStartEdit = useCallback((bookmark: WorkflowBookmark) => {
    setEditingId(bookmark.id);
    setEditingName(bookmark.name);
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    if (editingName.trim()) {
      updateBookmark(id, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName("");
  }, [editingName, updateBookmark]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const formatZoom = (zoom: number): string => {
    return `${Math.round(zoom * 100)}%`;
  };

  const sortedBookmarks = useMemo(() => {
    return [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);
  }, [bookmarks]);

  return (
    <Paper className="bookmark-panel" css={styles(theme)} square elevation={0}>
      <Box className="bookmark-header">
        <Box className="bookmark-header-title">
          <LocationOnIcon fontSize="small" />
          <Typography variant="subtitle2">Bookmarks</Typography>
          <Typography variant="caption" sx={{ opacity: 0.6, ml: 0.5 }}>
            ({bookmarks.length})
          </Typography>
        </Box>
      </Box>

      <Box className="add-bookmark-form">
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Bookmark name..."
            value={newBookmarkName}
            onChange={(e) => setNewBookmarkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddBookmark();
              }
            }}
            variant="outlined"
            sx={{
              "& .MuiOutlinedInput-root": {
                fontSize: "0.875rem"
              }
            }}
          />
          <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Add bookmark at current view">
            <IconButton
              color="primary"
              onClick={handleAddBookmark}
              disabled={!getViewport()}
              size="small"
            >
              <BookmarkAddIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {sortedBookmarks.length === 0 ? (
        <Box className="bookmark-empty">
          <BookmarkAddIcon sx={{ fontSize: 48, mb: 2, opacity: 0.4 }} />
          <Typography variant="body2" gutterBottom>
            No bookmarks yet
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Save your current view to quickly navigate back later
          </Typography>
        </Box>
      ) : (
        <>
          <List className="bookmark-list" dense>
            {sortedBookmarks.map((bookmark) => (
              <ListItem
                key={bookmark.id}
                className={`bookmark-item ${
                  currentBookmarkId === bookmark.id ? "bookmark-item-active" : ""
                }`}
                disablePadding
                sx={{ mb: 1 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    width: "100%",
                    flexDirection: "column"
                  }}
                >
                  <ListItemButton
                    onClick={() => handleNavigateToBookmark(bookmark)}
                    sx={{ padding: theme.spacing(1) }}
                  >
                    <Box
                      className="bookmark-color-indicator"
                      sx={{ backgroundColor: bookmark.color ?? "#3b82f6" }}
                    />
                    <Box className="bookmark-item-content">
                      {editingId === bookmark.id ? (
                        <TextField
                          fullWidth
                          size="small"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleSaveEdit(bookmark.id);
                            } else if (e.key === "Escape") {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                          variant="standard"
                          sx={{ fontSize: "0.875rem" }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <Typography className="bookmark-item-name" noWrap>
                          {bookmark.name}
                        </Typography>
                      )}
                      <Typography className="bookmark-item-zoom" variant="caption">
                        Zoom: {formatZoom(bookmark.viewport.zoom)}
                      </Typography>
                    </Box>
                  </ListItemButton>
                  <Box className="bookmark-item-actions" sx={{ px: 1, pb: 1 }}>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Navigate to">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigateToBookmark(bookmark);
                        }}
                      >
                        <NavigateNextIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Edit name">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(bookmark);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Remove">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBookmark(bookmark.id);
                        }}
                      >
                        <BookmarkRemoveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </ListItem>
            ))}
          </List>

          <Divider />

          <Box className="navigation-controls">
            <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Previous bookmark">
              <IconButton
                onClick={handleNavigatePrev}
                disabled={bookmarks.length === 0}
                size="small"
              >
                <NavigateBeforeIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ mx: 1, alignSelf: "center" }}>
              {currentBookmarkId
                ? `${bookmarks.findIndex((b) => b.id === currentBookmarkId) + 1} / ${bookmarks.length}`
                : "Not at bookmark"}
            </Typography>
            <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Next bookmark">
              <IconButton
                onClick={handleNavigateNext}
                disabled={bookmarks.length === 0}
                size="small"
              >
                <NavigateNextIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </Paper>
  );
};

export default BookmarkPanel;
