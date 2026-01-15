import React, { useCallback, useMemo } from "react";
import {
  Box,
  List,
  ListItemButton,
  Typography,
  IconButton,
  Tooltip,
  Chip
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import { useSnippetStore, Snippet } from "../../stores/SnippetStore";

interface SnippetsListProps {
  onSelectSnippet: (snippet: Snippet) => void;
}

const SnippetsList: React.FC<SnippetsListProps> = ({ onSelectSnippet }) => {
  const snippets = useSnippetStore((state) => state.snippets);
  const deleteSnippet = useSnippetStore((state) => state.deleteSnippet);

  const sortedSnippets = useMemo(() => {
    return [...snippets].sort((a, b) => b.usageCount - a.usageCount);
  }, [snippets]);

  const handleDelete = useCallback((event: React.MouseEvent, snippetId: string) => {
    event.stopPropagation();
    if (confirm("Are you sure you want to delete this snippet?")) {
      deleteSnippet(snippetId);
    }
  }, [deleteSnippet]);

  if (snippets.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No saved snippets yet.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Select 2+ connected nodes and click &quot;Save as Snippet&quot; in the toolbar to create one.
        </Typography>
      </Box>
    );
  }

  return (
    <List sx={{ py: 0 }}>
      {sortedSnippets.map((snippet) => (
        <ListItemButton
          key={snippet.id}
          onClick={() => onSelectSnippet(snippet)}
          sx={{
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            "&:hover": {
              bgcolor: "action.hover"
            }
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap fontWeight="medium">
              {snippet.name}
            </Typography>
            {snippet.description && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                {snippet.description}
              </Typography>
            )}
            <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
              <Chip
                label={`${snippet.nodes.length} nodes`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: "0.7rem" }}
              />
              {snippet.usageCount > 0 && (
                <Chip
                  label={`Used ${snippet.usageCount}x`}
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ height: 20, fontSize: "0.7rem" }}
                />
              )}
            </Box>
          </Box>
          <Tooltip title="Delete snippet">
            <IconButton
              size="small"
              onClick={(e) => handleDelete(e, snippet.id)}
              sx={{ ml: 1 }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </ListItemButton>
      ))}
    </List>
  );
};

export default SnippetsList;
