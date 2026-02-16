/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip
} from "@mui/material";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useNodeBookmarkStore } from "../../stores/NodeBookmarkStore";
import { useReactFlow } from "@xyflow/react";
import { useNodeBookmarks } from "../../hooks/useNodeBookmarks";

const styles = (theme: Theme) =>
  css({
    "&.bookmark-navigator": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .navigator-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "4px"
    },
    "& .navigator-title": {
      fontSize: "0.85rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    "& .bookmarks-list": {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    "& .bookmark-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid transparent`,
      transition: "all 0.2s ease",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.primary.main
      }
    },
    "& .bookmark-slot": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "28px",
      height: "28px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      fontSize: "0.85rem",
      fontWeight: 700,
      fontFamily: "monospace"
    },
    "& .bookmark-info": {
      flex: 1,
      minWidth: 0
    },
    "& .bookmark-name": {
      fontSize: "0.85rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .bookmark-type": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .bookmark-actions": {
      display: "flex",
      gap: "2px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem",
      textAlign: "center",
      opacity: 0.7
    },
    "& .empty-icon": {
      fontSize: "32px",
      marginBottom: "8px",
      opacity: 0.5
    }
  });

interface BookmarkNavigatorProps {
  /** Optional class name for custom styling */
  className?: string;
  /** Optional workflow ID - if not provided, will use the current workflow */
  workflowId?: string;
}

export const BookmarkNavigator = memo(({ className, workflowId: propWorkflowId }: BookmarkNavigatorProps) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);
  const { getViewport, setViewport } = useReactFlow();
  const { getWorkflowId } = useNodeBookmarks();
  const removeBookmark = useNodeBookmarkStore((state) => state.removeBookmark);
  const getAllBookmarks = useNodeBookmarks(); // Get the function from hook

  const workflowId = propWorkflowId || getWorkflowId();

  const bookmarks = useMemo(() => {
    if (!workflowId) {
      return [];
    }
    return getAllBookmarks.getAllBookmarks(workflowId);
  }, [workflowId, getAllBookmarks]);

  const sortedBookmarks = useMemo(() => {
    return [...bookmarks].sort((a, b) => a.index - b.index);
  }, [bookmarks]);

  const handleBookmarkClick = useCallback(
    (bookmark: { position: { x: number; y: number } }) => {
      // Navigate to the bookmarked node
      const viewport = getViewport();
      const targetX = -bookmark.position.x * viewport.zoom + window.innerWidth / 2;
      const targetY = -bookmark.position.y * viewport.zoom + window.innerHeight / 2;

      setViewport(
        {
          x: targetX,
          y: targetY,
          zoom: viewport.zoom
        },
        { duration: 300 }
      );
    },
    [getViewport, setViewport]
  );

  const handleRemoveBookmark = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      if (workflowId) {
        removeBookmark(workflowId, index);
      }
    },
    [workflowId, removeBookmark]
  );

  const getShortcutHint = useCallback((index: number) => {
    return `Alt+${index}`;
  }, []);

  if (!workflowId) {
    return null;
  }

  return (
    <Box className={`bookmark-navigator ${className || ""}`} css={memoizedStyles}>
      <div className="navigator-header">
        <Typography className="navigator-title">
          <BookmarkIcon fontSize="small" />
          Bookmarks
        </Typography>
        {bookmarks.length > 0 && (
          <Chip
            label={`${bookmarks.length}/9`}
            size="small"
            sx={{
              height: "20px",
              fontSize: "0.7rem",
              backgroundColor: "action.selected",
              color: "text.secondary"
            }}
          />
        )}
      </div>

      <div className="bookmarks-list">
        {sortedBookmarks.length === 0 ? (
          <div className="empty-state">
            <BookmarkBorderIcon className="empty-icon" />
            <div>No bookmarks yet</div>
            <div style={{ fontSize: "0.75rem", marginTop: "4px" }}>
              Select a node and press Ctrl+Shift+1-9
            </div>
          </div>
        ) : (
          sortedBookmarks.map((bookmark) => (
            <Tooltip
              key={bookmark.index}
              title={`Go to bookmark ${bookmark.index} (${getShortcutHint(bookmark.index)})`}
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="bookmark-item"
                onClick={() => handleBookmarkClick(bookmark)}
              >
                <div className="bookmark-slot">{bookmark.index}</div>
                <div className="bookmark-info">
                  <div className="bookmark-name">{bookmark.nodeName}</div>
                  <div className="bookmark-type">{bookmark.nodeType}</div>
                </div>
                <div className="bookmark-actions">
                  <Tooltip
                    title="Remove bookmark"
                    enterDelay={TOOLTIP_ENTER_DELAY}
                  >
                    <IconButton
                      size="small"
                      onClick={(e) => handleRemoveBookmark(bookmark.index, e)}
                      sx={{
                        padding: "4px",
                        color: "text.secondary",
                        "&:hover": {
                          color: "error.main",
                          backgroundColor: "error.main",
                          opacity: 0.1
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </Tooltip>
          ))
        )}
      </div>
    </Box>
  );
});

BookmarkNavigator.displayName = "BookmarkNavigator";

export default BookmarkNavigator;
