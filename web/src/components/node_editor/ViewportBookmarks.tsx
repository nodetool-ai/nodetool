/** @jsxImportSource @emotion/react */
import { useState, useCallback, useMemo } from "react";
import {
  Popover,
  Box,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip
} from "@mui/material";
import {
  Bookmark as BookmarkIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useReactFlow } from "@xyflow/react";
import useViewportBookmarksStore from "../../stores/ViewportBookmarksStore";
import type { ViewportBookmark } from "../../stores/ViewportBookmarksStore";
import { useNotificationStore } from "../../stores/NotificationStore";

interface ViewportBookmarksProps {
  workflowId: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  open: boolean;
}

/**
 * ViewportBookmarks component - manages saved viewport positions.
 *
 * Features:
 * - View all bookmarks for current workflow
 * - Add new bookmark at current viewport position
 * - Navigate to saved bookmark
 * - Rename and delete bookmarks
 *
 * @example
 * ```tsx
 * <ViewportBookmarks
 *   workflowId={workflowId}
 *   anchorEl={anchorEl}
 *   onClose={handleClose}
 *   open={open}
 * />
 * ```
 */
const ViewportBookmarks: React.FC<ViewportBookmarksProps> = ({
  workflowId,
  anchorEl,
  onClose,
  open
}) => {
  const theme = useTheme();
  const reactFlow = useReactFlow();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [bookmarkName, setBookmarkName] = useState("");
  const [editingBookmark, setEditingBookmark] =
    useState<ViewportBookmark | null>(null);

  // Selective subscriptions to prevent re-renders
  const bookmarks = useViewportBookmarksStore(
    (state) => state.getBookmarks(workflowId)
  );
  const addBookmark = useViewportBookmarksStore((state) => state.addBookmark);
  const updateBookmark = useViewportBookmarksStore((state) => state.updateBookmark);
  const deleteBookmark = useViewportBookmarksStore((state) => state.deleteBookmark);

  /**
   * Navigate to a bookmark's viewport position.
   */
  const handleNavigateToBookmark = useCallback(
    (bookmark: ViewportBookmark) => {
      reactFlow.setCenter(bookmark.x, bookmark.y, { duration: 300 });
      reactFlow.zoomTo(bookmark.zoom, { duration: 300 });
      onClose();
    },
    [reactFlow, onClose]
  );

  /**
   * Open create bookmark dialog with current viewport info.
   */
  const handleOpenCreateDialog = useCallback(() => {
    setBookmarkName("");
    setCreateDialogOpen(true);
  }, []);

  /**
   * Create a new bookmark at current viewport.
   */
  const handleCreateBookmark = useCallback(() => {
    const viewport = reactFlow.getViewport();
    const name = bookmarkName.trim() || `Bookmark ${bookmarks.length + 1}`;

    try {
      addBookmark(
        workflowId,
        name,
        viewport.x,
        viewport.y,
        viewport.zoom
      );
      addNotification({
        content: `Bookmark "${name}" created`,
        type: "success",
        alert: true
      });
      setCreateDialogOpen(false);
      setBookmarkName("");
    } catch (error) {
      addNotification({
        content:
          error instanceof Error ? error.message : "Failed to create bookmark",
        type: "error",
        alert: true
      });
    }
  }, [
    reactFlow,
    workflowId,
    bookmarkName,
    bookmarks.length,
    addBookmark,
    addNotification
  ]);

  /**
   * Open rename dialog for a bookmark.
   */
  const handleOpenRenameDialog = useCallback((bookmark: ViewportBookmark) => {
    setEditingBookmark(bookmark);
    setBookmarkName(bookmark.name);
    setRenameDialogOpen(true);
  }, []);

  /**
   * Rename the selected bookmark.
   */
  const handleRenameBookmark = useCallback(() => {
    if (!editingBookmark) {
      return;
    }

    const newName = bookmarkName.trim();
    if (!newName) {
      addNotification({
        content: "Bookmark name cannot be empty",
        type: "error",
        alert: true
      });
      return;
    }

    try {
      updateBookmark(workflowId, editingBookmark.id, newName);
      addNotification({
        content: `Bookmark renamed to "${newName}"`,
        type: "success",
        alert: true
      });
      setRenameDialogOpen(false);
      setEditingBookmark(null);
      setBookmarkName("");
    } catch (error) {
      addNotification({
        content:
          error instanceof Error ? error.message : "Failed to rename bookmark",
        type: "error",
        alert: true
      });
    }
  }, [
    editingBookmark,
    bookmarkName,
    workflowId,
    updateBookmark,
    addNotification
  ]);

  /**
   * Delete a bookmark with confirmation.
   */
  const handleDeleteBookmark = useCallback(
    (bookmark: ViewportBookmark) => {
      deleteBookmark(workflowId, bookmark.id);
      addNotification({
        content: `Bookmark "${bookmark.name}" deleted`,
        type: "success",
        alert: true
      });
    },
    [workflowId, deleteBookmark, addNotification]
  );

  /**
   * Format zoom level as percentage.
   */
  const formatZoom = useCallback((zoom: number): string => {
    return `${Math.round(zoom * 100)}%`;
  }, []);

  /**
   * Format position for display.
   */
  const formatPosition = useCallback((x: number, y: number): string => {
    return `(${Math.round(x)}, ${Math.round(y)})`;
  }, []);

  // Sort bookmarks by creation date (newest first)
  const sortedBookmarks = useMemo(() => {
    return [...bookmarks].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [bookmarks]);

  return (
    <>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 400,
              backgroundColor: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: 1
            }
          }
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <Typography variant="subtitle2" fontWeight="medium">
            Viewport Bookmarks
          </Typography>
          <Tooltip title="Add current view as bookmark">
            <IconButton
              size="small"
              onClick={handleOpenCreateDialog}
              sx={{
                backgroundColor: theme.vars.palette.primary.main,
                color: theme.vars.palette.primary.contrastText,
                "&:hover": {
                  backgroundColor: theme.vars.palette.primary.dark
                }
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <List
          dense
          sx={{
            maxHeight: 300,
            overflow: "auto"
          }}
        >
          {sortedBookmarks.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <BookmarkIcon
                sx={{
                  fontSize: 48,
                  color: "text.disabled",
                  mb: 1
                }}
              />
              <Typography variant="body2" color="text.secondary">
                No bookmarks yet
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Save your current view to get started
              </Typography>
            </Box>
          ) : (
            sortedBookmarks.map((bookmark) => (
              <ListItem
                key={bookmark.id}
                disablePadding
                secondaryAction={
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Rename">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenRenameDialog(bookmark)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteBookmark(bookmark)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
                sx={{
                  borderBottom: `1px solid ${theme.vars.palette.divider}`
                }}
              >
                <ListItemButton
                  onClick={() => handleNavigateToBookmark(bookmark)}
                  sx={{ py: 1 }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight="medium">
                        {bookmark.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {formatZoom(bookmark.zoom)} •{" "}
                        {formatPosition(bookmark.x, bookmark.y)}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </Popover>

      {/* Create Bookmark Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Viewport Bookmark</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Bookmark name"
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            placeholder={`Bookmark ${bookmarks.length + 1}`}
            sx={{ mt: 2 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateBookmark();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateBookmark}
            disabled={!bookmarkName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Bookmark Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Bookmark</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Bookmark name"
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            sx={{ mt: 2 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRenameBookmark();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRenameDialogOpen(false);
              setEditingBookmark(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRenameBookmark}
            disabled={!bookmarkName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ViewportBookmarks;
