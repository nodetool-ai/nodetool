/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState } from "react";
import {
  Box,
  Popover,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  IconButton,
  Tooltip,
  TextField
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import BookmarkRemoveIcon from "@mui/icons-material/BookmarkRemove";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import { Viewport } from "@xyflow/react";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useBookmarkStore, WorkflowBookmark } from "../../stores/BookmarkStore";

const styles = (theme: Theme) =>
  css({
    ".bookmark-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "32px",
      height: "32px",
      borderRadius: "6px",
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".bookmark-popover": {
      width: 300,
      maxHeight: 400,
      overflow: "auto"
    },
    ".bookmark-list-item": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      }
    },
    ".bookmark-item-active": {
      backgroundColor: theme.vars.palette.action.selected
    }
  });

interface BookmarkButtonProps {
  onNavigateToViewport?: (viewport: Viewport) => void;
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({
  onNavigateToViewport
}) => {
  const theme = useTheme();

  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  const currentBookmarkId = useBookmarkStore((state) => state.currentBookmarkId);
  const addBookmark = useBookmarkStore((state) => state.addBookmark);
  const removeBookmark = useBookmarkStore((state) => state.removeBookmark);
  const navigateToBookmark = useBookmarkStore((state) => state.navigateToBookmark);
  const setCurrentBookmark = useBookmarkStore((state) => state.setCurrentBookmark);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [newBookmarkName, setNewBookmarkName] = useState("");

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    setNewBookmarkName("");
  }, []);

  const handleAddBookmark = useCallback(() => {
    const name = newBookmarkName.trim() || `Bookmark ${bookmarks.length + 1}`;
    addBookmark(name, { x: 0, y: 0, zoom: 1 });
    setNewBookmarkName("");
  }, [newBookmarkName, bookmarks.length, addBookmark]);

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

  const sortedBookmarks = React.useMemo(() => {
    return [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);
  }, [bookmarks]);

  return (
    <Box css={styles(theme)}>
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">Bookmarks</Typography>
            <div className="tooltip-key">
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>
            </div>
          </div>
        }
      >
        <IconButton
          className="bookmark-button"
          onClick={handleClick}
          tabIndex={-1}
          size="small"
        >
          <BookmarkIcon />
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
      >
        <Box className="bookmark-popover" sx={{ p: 1 }}>
          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
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
              sx={{ fontSize: "0.875rem" }}
            />
            <IconButton
              color="primary"
              onClick={handleAddBookmark}
              size="small"
            >
              <BookmarkAddIcon />
            </IconButton>
          </Box>

          {sortedBookmarks.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ textAlign: "center", py: 2, opacity: 0.6 }}
            >
              No bookmarks yet. Add one to quickly navigate back.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mb: 1 }}>
                <IconButton
                  size="small"
                  onClick={handleNavigatePrev}
                  disabled={bookmarks.length === 0}
                >
                  <NavigateBeforeIcon />
                </IconButton>
                <Typography variant="caption" sx={{ alignSelf: "center" }}>
                  {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
                </Typography>
                <IconButton
                  size="small"
                  onClick={handleNavigateNext}
                  disabled={bookmarks.length === 0}
                >
                  <NavigateNextIcon />
                </IconButton>
              </Box>

              <List dense>
                {sortedBookmarks.map((bookmark) => (
                  <ListItem
                    key={bookmark.id}
                    className={`bookmark-list-item ${
                      currentBookmarkId === bookmark.id ? "bookmark-item-active" : ""
                    }`}
                    disablePadding
                  >
                    <ListItemButton
                      onClick={() => handleNavigateToBookmark(bookmark)}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: "100%",
                          borderRadius: 1,
                          mr: 1,
                          backgroundColor: bookmark.color ?? "#3b82f6"
                        }}
                      />
                      <ListItemText
                        primary={bookmark.name}
                        secondary={`Zoom: ${Math.round(bookmark.viewport.zoom * 100)}%`}
                        primaryTypographyProps={{ noWrap: true, fontSize: "0.875rem" }}
                        secondaryTypographyProps={{ fontSize: "0.75rem" }}
                      />
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
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Box>
      </Popover>
    </Box>
  );
};

export default BookmarkButton;
