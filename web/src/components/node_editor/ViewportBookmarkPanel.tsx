import { memo, useCallback, useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Popover,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem
} from "@mui/material";
import { useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditIcon from "@mui/icons-material/Edit";
import { useViewportBookmarkStore, type ViewportBookmark } from "../../stores/ViewportBookmarkStore";

interface ViewportBookmarkPanelProps {
  workflowId: string;
  visible?: boolean;
}

interface AddBookmarkDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

interface EditBookmarkDialogProps {
  open: boolean;
  onClose: () => void;
  bookmark: ViewportBookmark | null;
  onSave: (id: string, name: string) => void;
}

const AddBookmarkDialog: React.FC<AddBookmarkDialogProps> = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState("");

  const handleAdd = useCallback(() => {
    if (name.trim()) {
      onAdd(name.trim());
      setName("");
      onClose();
    }
  }, [name, onAdd, onClose]);

  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && name.trim()) {
        handleAdd();
      }
    },
    [name, handleAdd]
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Viewport Bookmark</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Bookmark Name"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="e.g., Input Nodes, Main Pipeline"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAdd} variant="contained" disabled={!name.trim()}>
          Add Bookmark
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const EditBookmarkDialog: React.FC<EditBookmarkDialogProps> = ({
  open,
  onClose,
  bookmark,
  onSave
}) => {
  const [name, setName] = useState("");

  // Update name when bookmark changes
  useEffect(() => {
    if (bookmark && name !== bookmark.name && open) {
      setName(bookmark.name);
    }
  }, [bookmark, open, name]);

  const handleSave = useCallback(() => {
    if (bookmark && name.trim()) {
      onSave(bookmark.id, name.trim());
      setName("");
      onClose();
    }
  }, [bookmark, name, onSave, onClose]);

  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && name.trim()) {
        handleSave();
      }
    },
    [name, handleSave]
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Bookmark</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Bookmark Name"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyPress={handleKeyPress}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ViewportBookmarkPanel: React.FC<ViewportBookmarkPanelProps> = ({
  workflowId,
  visible = true
}) => {
  const theme = useTheme();
  const { setViewport, getViewport } = useReactFlow();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<ViewportBookmark | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedBookmark, setSelectedBookmark] = useState<ViewportBookmark | null>(null);

  const bookmarks = useViewportBookmarkStore((state) => state.getBookmarks(workflowId));
  const addBookmark = useViewportBookmarkStore((state) => state.addBookmark);
  const updateBookmark = useViewportBookmarkStore((state) => state.updateBookmark);
  const deleteBookmark = useViewportBookmarkStore((state) => state.deleteBookmark);

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
    setMenuAnchor(null);
    setSelectedBookmark(null);
  }, []);

  const handleAddBookmark = useCallback(() => {
    setAddDialogOpen(true);
    handleCloseMenu();
  }, [handleCloseMenu]);

  const handleAddConfirm = useCallback(
    (name: string) => {
      const viewport = getViewport();
      addBookmark(workflowId, name, viewport.x, viewport.y, viewport.zoom);
    },
    [workflowId, getViewport, addBookmark]
  );

  const handleBookmarkClick = useCallback(
    (bookmark: ViewportBookmark) => {
      setViewport({ x: bookmark.x, y: bookmark.y, zoom: bookmark.zoom }, { duration: 300 });
      handleCloseMenu();
    },
    [setViewport, handleCloseMenu]
  );

  const handleBookmarkMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, bookmark: ViewportBookmark) => {
      event.stopPropagation();
      setMenuAnchor(event.currentTarget);
      setSelectedBookmark(bookmark);
    },
    []
  );

  const handleEditBookmark = useCallback(() => {
    setEditingBookmark(selectedBookmark);
    setEditDialogOpen(true);
    setMenuAnchor(null);
  }, [selectedBookmark]);

  const handleEditSave = useCallback(
    (id: string, name: string) => {
      updateBookmark(workflowId, id, { name });
      setEditDialogOpen(false);
      setEditingBookmark(null);
    },
    [workflowId, updateBookmark]
  );

  const handleDeleteBookmark = useCallback(() => {
    if (selectedBookmark) {
      deleteBookmark(workflowId, selectedBookmark.id);
    }
    setMenuAnchor(null);
    setSelectedBookmark(null);
  }, [selectedBookmark, workflowId, deleteBookmark]);

  if (!visible) {
    return null;
  }

  return (
    <>
      <Tooltip
        title={
          <Box>
            <Box>Viewport Bookmarks</Box>
            <Box sx={{ mt: 0.5, fontSize: "0.7rem", opacity: 0.8 }}>
              Save and navigate to viewport positions
            </Box>
          </Box>
        }
        placement="top"
        arrow
      >
        <IconButton
          onClick={handleOpenMenu}
          size="small"
          sx={{
            padding: "2px",
            color: bookmarks.length > 0 ? theme.palette.primary.main : theme.vars.palette.text.secondary,
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover
            }
          }}
          aria-label="Open viewport bookmarks"
        >
          {bookmarks.length > 0 ? <BookmarkIcon sx={{ fontSize: "1rem" }} /> : <BookmarkBorderIcon sx={{ fontSize: "1rem" }} />}
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleCloseMenu}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
        PaperProps={{
          sx: {
            minWidth: 280,
            maxWidth: 320,
            maxHeight: 400
          }
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Typography variant="subtitle2" fontWeight={500}>
            Viewport Bookmarks
          </Typography>
          <Tooltip title="Add current view as bookmark" placement="top">
            <IconButton
              size="small"
              onClick={handleAddBookmark}
              sx={{ color: theme.vars.palette.text.secondary }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <List dense disablePadding sx={{ maxHeight: 300, overflow: "auto" }}>
          {bookmarks.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                No bookmarks yet
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Add your current viewport position
              </Typography>
            </Box>
          ) : (
            bookmarks.map((bookmark) => (
              <ListItemButton
                key={bookmark.id}
                onClick={() => handleBookmarkClick(bookmark)}
                sx={{
                  px: 2,
                  py: 1,
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover
                  }
                }}
              >
                <ListItemIcon>
                  <BookmarkIcon
                    fontSize="small"
                    sx={{ color: theme.palette.primary.main }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={bookmark.name}
                  primaryTypographyProps={{
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    noWrap: true
                  }}
                  secondary={`${Math.round(bookmark.zoom * 100)}% zoom`}
                  secondaryTypographyProps={{
                    fontSize: "0.7rem",
                    color: "text.secondary"
                  }}
                />
                <Tooltip title="Bookmark options" placement="left">
                  <IconButton
                    size="small"
                    onClick={(e) => handleBookmarkMenu(e, bookmark)}
                    sx={{ ml: 1 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))
          )}
        </List>
      </Popover>

      <Menu
        open={Boolean(menuAnchor)}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
      >
        <MenuItem onClick={handleEditBookmark}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Rename
        </MenuItem>
        <MenuItem onClick={handleDeleteBookmark} sx={{ color: theme.palette.error.main }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      <AddBookmarkDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddConfirm}
      />

      <EditBookmarkDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingBookmark(null);
        }}
        bookmark={editingBookmark}
        onSave={handleEditSave}
      />
    </>
  );
};

export default memo(ViewportBookmarkPanel);
