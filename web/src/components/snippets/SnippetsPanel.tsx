/**
 * SnippetsPanel
 *
 * Panel component for managing and inserting node snippets.
 * Displays saved snippets in a list with options to view, insert, or delete them.
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Tooltip,
  Chip,
  TextField,
  InputAdornment,
  Alert
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import InsertIcon from "@mui/icons-material/AddCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import useNodeSnippetsStore from "../../stores/NodeSnippetsStore";
import { useNodeSnippets } from "../../hooks/useNodeSnippets";
import { useReactFlow } from "@xyflow/react";

export interface SnippetsPanelProps {
  /** Optional className for styling */
  className?: string;
}

/**
 * Panel for managing and inserting node snippets
 */
const SnippetsPanel: React.FC<SnippetsPanelProps> = memo(({ className }) => {
  const theme = useTheme();
  const { getViewport } = useReactFlow();
  const { deleteSnippet, restoreSnippet } = useNodeSnippets();
  const snippets = useNodeSnippetsStore((state) => state.snippets);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [insertedSnippetId, setInsertedSnippetId] = React.useState<string | null>(null);

  // Filter snippets based on search query
  const filteredSnippets = useMemo(() => {
    if (!searchQuery.trim()) {
      return snippets;
    }

    const query = searchQuery.toLowerCase();
    return snippets.filter(
      (snippet) =>
        snippet.name.toLowerCase().includes(query) ||
        snippet.description.toLowerCase().includes(query) ||
        snippet.nodes.some((node) => node.type.toLowerCase().includes(query))
    );
  }, [snippets, searchQuery]);

  // Format timestamp for display
  const formatDate = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }, []);

  // Handle snippet insertion
  const handleInsertSnippet = useCallback(
    (snippetId: string) => {
      const viewport = getViewport();
      // Calculate position at center of viewport, adjusted for zoom
      const position = {
        x: (-viewport.x + 400) / viewport.zoom,
        y: (-viewport.y + 300) / viewport.zoom
      };

      try {
        restoreSnippet(snippetId, position);
        setInsertedSnippetId(snippetId);
        // Clear success message after 3 seconds
        setTimeout(() => setInsertedSnippetId(null), 3000);
      } catch (error) {
        console.error("Failed to restore snippet:", error);
      }
    },
    [getViewport, restoreSnippet]
  );

  // Handle snippet deletion with confirmation
  const handleDeleteSnippet = useCallback(
    (snippetId: string, snippetName: string) => {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete snippet "${snippetName}"?`)) {
        deleteSnippet(snippetId);
      }
    },
    [deleteSnippet]
  );

  return (
    <Box className={className} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="h6" gutterBottom>
          Node Snippets
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Save and reuse node configurations
        </Typography>
      </Box>

      {/* Success message */}
      {insertedSnippetId && (
        <Alert severity="success" sx={{ m: 2, mt: 1 }}>
          Snippet inserted successfully!
        </Alert>
      )}

      {/* Search */}
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search snippets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      {/* Snippets List */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {filteredSnippets.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <DescriptionIcon
              sx={{ fontSize: 48, color: "text.disabled", mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary">
              {searchQuery
                ? "No snippets match your search"
                : "No snippets saved yet"}
            </Typography>
            {!searchQuery && (
              <Typography variant="caption" color="text.secondary">
                Select nodes and choose &quot;Save as Snippet&quot; from the context menu
              </Typography>
            )}
          </Box>
        ) : (
          <List dense>
            {filteredSnippets.map((snippet) => (
              <ListItem
                key={snippet.id}
                disablePadding
                secondaryAction={
                  <ListItemSecondaryAction>
                    <Tooltip title="Insert into workflow">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleInsertSnippet(snippet.id)}
                        sx={{ mr: 0.5 }}
                      >
                        <InsertIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete snippet">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() =>
                          handleDeleteSnippet(snippet.id, snippet.name)
                        }
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                }
              >
                <ListItemButton onClick={() => handleInsertSnippet(snippet.id)}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="subtitle2" noWrap>
                          {snippet.name}
                        </Typography>
                        <Chip
                          label={`${snippet.nodeCount} node${snippet.nodeCount > 1 ? "s" : ""}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem" }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        {snippet.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            noWrap
                          >
                            {snippet.description}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontSize: "0.7rem" }}
                        >
                          {formatDate(snippet.updatedAt)}
                        </Typography>
                      </Box>
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
});

SnippetsPanel.displayName = "SnippetsPanel";

export default SnippetsPanel;
