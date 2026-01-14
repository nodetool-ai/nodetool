/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Divider,
  Menu,
  MenuItem
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import HistoryIcon from "@mui/icons-material/History";
import DownloadIcon from "@mui/icons-material/Download";
import UploadIcon from "@mui/icons-material/Upload";
import useSnippetStore from "../../stores/SnippetStore";
import { useSnippetActions } from "../../hooks/useSnippetActions";
import { Snippet } from "../../stores/SnippetTypes";
import { getShortcutTooltip } from "../../config/shortcuts";

const styles = (theme: Theme) =>
  css({
    "&.snippet-library-panel": {
      position: "fixed",
      top: "80px",
      right: "50px",
      width: "380px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
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
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px"
    },
    "& .search-box": {
      marginBottom: "12px"
    },
    "& .snippet-count": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px"
    },
    "& .snippet-list": {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    "& .snippet-item": {
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.15s ease",
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .snippet-item.selected": {
      borderColor: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.action.selected
    },
    "& .snippet-item-content": {
      padding: "10px 12px"
    },
    "& .snippet-name": {
      fontSize: "14px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      marginBottom: "4px"
    },
    "& .snippet-description": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "6px"
    },
    "& .snippet-meta": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "11px",
      color: theme.vars.palette.text.disabled
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      textAlign: "center"
    },
    "& .empty-state-icon": {
      fontSize: "48px",
      marginBottom: "12px",
      color: theme.vars.palette.text.disabled
    },
    "& .empty-state-text": {
      fontSize: "14px",
      color: theme.vars.palette.text.secondary,
      marginBottom: "16px"
    },
    "& .panel-actions": {
      display: "flex",
      gap: "8px",
      padding: "12px 16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .usage-count": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    }
  });

interface SnippetLibraryPanelProps {
  visible: boolean;
  onClose: () => void;
}

const SnippetCard = memo<{
  snippet: Snippet;
  isSelected: boolean;
  onSelect: () => void;
  onInsert: () => void;
  onMenuOpen: (event: React.MouseEvent, snippet: Snippet) => void;
}>(({ snippet, isSelected, onSelect, onInsert, onMenuOpen }) => {
  const theme = useTheme();

  return (
    <ListItem
      className={`snippet-item ${isSelected ? "selected" : ""}`}
      disablePadding
      sx={{ mb: 1 }}
    >
      <ListItemButton
        onClick={onSelect}
        sx={{ p: 0 }}
      >
        <Box className="snippet-item-content" sx={{ width: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box sx={{ flex: 1 }}>
              <Typography className="snippet-name">
                {snippet.name}
              </Typography>
              {snippet.description && (
                <Typography className="snippet-description">
                  {snippet.description}
                </Typography>
              )}
              <Box className="snippet-meta">
                <Typography variant="caption">
                  {snippet.nodes.length} nodes
                </Typography>
                <Typography variant="caption">
                  •
                </Typography>
                <Typography variant="caption" className="usage-count">
                  <HistoryIcon sx={{ fontSize: 12, mr: 0.5 }} />
                  {snippet.usageCount} uses
                </Typography>
              </Box>
            </Box>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onMenuOpen(e, snippet);
              }}
              sx={{ mt: -0.5 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
          <Button
            variant="outlined"
            size="small"
            fullWidth
            onClick={(e) => {
              e.stopPropagation();
              onInsert();
            }}
            sx={{ mt: 1 }}
          >
            Insert Snippet
          </Button>
        </Box>
      </ListItemButton>
    </ListItem>
  );
});

SnippetCard.displayName = "SnippetCard";

const SnippetLibraryPanel: React.FC<SnippetLibraryPanelProps> = ({
  visible,
  onClose
}) => {
  const theme = useTheme();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [snippetName, setSnippetName] = useState("");
  const [snippetDescription, setSnippetDescription] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuSnippet, setMenuSnippet] = useState<Snippet | null>(null);

  const {
    snippets,
    searchQuery,
    selectedSnippetId,
    setSearchQuery,
    selectSnippet,
    deleteSnippet,
    duplicateSnippet,
    exportSnippets,
    importSnippets
  } = useSnippetStore();

  const { saveSelectedAsSnippet, pasteSnippet } = useSnippetActions();

  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) return snippets;

    const query = searchQuery.toLowerCase();
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.description?.toLowerCase().includes(query) ?? false) ||
        s.nodes.some((n) => (n.type ?? "").toLowerCase().includes(query))
    );
  }, [snippets, searchQuery]);

  const handleSave = () => {
    if (snippetName.trim()) {
      saveSelectedAsSnippet(snippetName.trim(), snippetDescription.trim());
      setSnippetName("");
      setSnippetDescription("");
      setSaveDialogOpen(false);
    }
  };

  const handleInsert = (snippet: Snippet) => {
    pasteSnippet(snippet);
    selectSnippet(snippet.id);
  };

  const handleMenuOpen = (event: React.MouseEvent, snippet: Snippet) => {
    event.preventDefault();
    setMenuAnchor(event.currentTarget as HTMLElement);
    setMenuSnippet(snippet);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuSnippet(null);
  };

  const handleDuplicate = () => {
    if (menuSnippet) {
      duplicateSnippet(menuSnippet.id);
    }
    handleMenuClose();
  };

  const handleDelete = () => {
    if (menuSnippet) {
      deleteSnippet(menuSnippet.id);
    }
    handleMenuClose();
  };

  const handleExport = () => {
    const json = exportSnippets();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nodetool-snippets-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const json = event.target?.result as string;
          const count = importSnippets(json);
          if (count > 0) {
            // Snippet import successful
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  if (!visible) {
    return null;
  }

  return (
    <Box className="snippet-library-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Typography className="panel-title">
          <AddIcon fontSize="small" />
          Snippet Library
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box className="panel-content">
        <Box className="search-box">
          <TextField
            fullWidth
            size="small"
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} />
            }}
          />
        </Box>

        <Typography className="snippet-count">
          {filteredSnippets.length} snippet{filteredSnippets.length !== 1 ? "s" : ""}
          {searchQuery && " found"}
        </Typography>

        {filteredSnippets.length === 0 ? (
          <Box className="empty-state">
            <Typography className="empty-state-icon">
              {searchQuery ? "🔍" : "📦"}
            </Typography>
            <Typography className="empty-state-text">
              {searchQuery
                ? "No snippets match your search"
                : "No snippets saved yet. Select nodes and save them as a snippet for reuse."}
            </Typography>
            {!searchQuery && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setSaveDialogOpen(true)}
              >
                Save Selected Nodes
              </Button>
            )}
          </Box>
        ) : (
          <List className="snippet-list" disablePadding>
            {filteredSnippets.map((snippet) => (
              <SnippetCard
                key={snippet.id}
                snippet={snippet}
                isSelected={selectedSnippetId === snippet.id}
                onSelect={() => selectSnippet(snippet.id)}
                onInsert={() => handleInsert(snippet)}
                onMenuOpen={handleMenuOpen}
              />
            ))}
          </List>
        )}
      </Box>

      <Box className="panel-actions">
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setSaveDialogOpen(true)}
          size="small"
        >
          Save Selection
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Import snippets">
          <IconButton size="small" onClick={handleImport}>
            <UploadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export snippets">
          <IconButton size="small" onClick={handleExport}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Selection as Snippet</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Snippet Name"
            value={snippetName}
            onChange={(e) => setSnippetName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description (optional)"
            multiline
            rows={2}
            value={snippetDescription}
            onChange={(e) => setSnippetDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!snippetName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleDuplicate}>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          Duplicate
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SnippetLibraryPanel;
