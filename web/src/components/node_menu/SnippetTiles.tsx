import React, { useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { useSnippetsStore } from '../../stores/SnippetsStore';
import { useNodeMenuStore } from '../../stores/NodeMenuStore';
import { useCreateNode } from '../../hooks/useCreateNode';

interface SnippetTileProps {
  snippet: {
    id: string;
    name: string;
    description?: string;
    nodeLabel: string;
    usageCount: number;
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const SnippetTile: React.FC<SnippetTileProps> = ({
  snippet,
  onEdit,
  onDelete,
}) => {
  const { createNodeFromSnippet } = useCreateNode();
  const snippetsStore = useSnippetsStore();

  const handleUse = useCallback(() => {
    const fullSnippet = snippetsStore.getSnippet(snippet.id);
    if (fullSnippet) {
      createNodeFromSnippet(fullSnippet);
      snippetsStore.incrementUsage(snippet.id);
    }
  }, [snippet.id, createNodeFromSnippet, snippetsStore]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.hover',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        '&:hover': {
          bgcolor: 'action.selected',
        },
      }}
      onClick={handleUse}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleUse();
        }
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {snippet.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {snippet.nodeLabel}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {onEdit && (
          <Tooltip title="Edit snippet">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(snippet.id);
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="Delete snippet">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(snippet.id);
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

interface SnippetTilesContainerProps {
  searchTerm?: string;
}

export const SnippetTilesContainer: React.FC<SnippetTilesContainerProps> = ({
  searchTerm = '',
}) => {
  const snippets = useSnippetsStore((state) => state.snippets);
  const nodeMenuStore = useNodeMenuStore();

  const filteredSnippets = searchTerm
    ? snippets.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.nodeLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
      )
    : snippets;

  if (filteredSnippets.length === 0) {
    return null;
  }

  const handleEdit = (id: string) => {
    const snippet = snippets.find((s) => s.id === id);
    if (snippet) {
      nodeMenuStore.openSaveSnippetDialog({
        mode: 'edit',
        snippet,
      });
    }
  };

  const handleDelete = (id: string) => {
    useSnippetsStore.getState().deleteSnippet(id);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        variant="overline"
        sx={{
          px: 1,
          color: 'text.secondary',
          fontWeight: 600,
          letterSpacing: 1,
        }}
      >
        Saved Snippets
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1,
          p: 1,
        }}
      >
        {filteredSnippets.map((snippet) => (
          <SnippetTile
            key={snippet.id}
            snippet={{
              id: snippet.id,
              name: snippet.name,
              description: snippet.description,
              nodeLabel: snippet.nodeLabel,
              usageCount: snippet.usageCount,
            }}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </Box>
    </Box>
  );
};
