import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSnippetsStore, NodeSnippet } from '../../stores/SnippetsStore';
import useMetadataStore from '../../stores/MetadataStore';
import { NodeMetadata } from '../../stores/ApiTypes';

interface SaveSnippetDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialData?: {
    nodeType?: string;
    nodeLabel?: string;
    properties?: Record<string, unknown>;
  };
  snippet?: NodeSnippet;
}

export const SaveSnippetDialog: React.FC<SaveSnippetDialogProps> = ({
  open,
  onClose,
  mode,
  initialData,
  snippet,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedNodeType, setSelectedNodeType] = useState('');
  const [selectedNodeLabel, setSelectedNodeLabel] = useState('');
  const [properties, setProperties] = useState<Record<string, unknown>>({});

  const metadataByType = useMetadataStore((state) => state.metadata);
  const snippetsStore = useSnippetsStore();

  useEffect(() => {
    if (mode === 'edit' && snippet) {
      setName(snippet.name);
      setDescription(snippet.description ?? '');
      setSelectedNodeType(snippet.nodeType);
      setSelectedNodeLabel(snippet.nodeLabel);
      setProperties(snippet.properties);
    } else if (mode === 'create' && initialData) {
      setSelectedNodeType(initialData.nodeType ?? '');
      setSelectedNodeLabel(initialData.nodeLabel ?? '');
      setProperties(initialData.properties ?? {});
      setName('');
      setDescription('');
    }
  }, [mode, snippet, initialData]);

  const handleSave = useCallback(() => {
    if (!name.trim() || !selectedNodeType) {
      return;
    }

    if (mode === 'edit' && snippet) {
      snippetsStore.updateSnippet(snippet.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        nodeType: selectedNodeType,
        nodeLabel: selectedNodeLabel,
        properties,
      });
    } else {
      snippetsStore.addSnippet({
        name: name.trim(),
        description: description.trim() || undefined,
        nodeType: selectedNodeType,
        nodeLabel: selectedNodeLabel,
        properties,
      });
    }

    onClose();
  }, [
    name,
    description,
    selectedNodeType,
    selectedNodeLabel,
    properties,
    mode,
    snippet,
    snippetsStore,
    onClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSave();
      }
    },
    [handleSave]
  );

  const availableNodes = Object.values(metadataByType).filter(
    (m): m is NodeMetadata => m !== undefined
  );

  const selectedMetadata = metadataByType[selectedNodeType];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      onKeyDown={handleKeyDown}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {mode === 'edit' ? 'Edit Snippet' : 'Save as Snippet'}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <TextField
            autoFocus
            label="Snippet Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., GPT-4 Quick Prompt"
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Brief description of when to use this snippet..."
          />

          <FormControl fullWidth required>
            <InputLabel>Node Type</InputLabel>
            <Select
              value={selectedNodeType}
              label="Node Type"
              onChange={(e) => {
                const nodeType = e.target.value;
                const metadata = metadataByType[nodeType];
                setSelectedNodeType(nodeType);
                setSelectedNodeLabel(metadata?.title ?? nodeType);
                if (metadata?.properties) {
                  const defaultProps: Record<string, unknown> = {};
                  for (const prop of metadata.properties) {
                    defaultProps[prop.name] = prop.default ?? '';
                  }
                  setProperties(defaultProps);
                } else {
                  setProperties({});
                }
              }}
            >
              {availableNodes.map((metadata) => (
                <MenuItem key={metadata.node_type} value={metadata.node_type}>
                  {metadata.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedMetadata?.properties && selectedMetadata.properties.length > 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Default Properties
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                {selectedMetadata.properties.map((prop) => (
                  <Chip
                    key={prop.name}
                    label={`${prop.name}: ${
                      properties[prop.name] ?? prop.default ?? '(empty)'
                    }`}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary">
                These property values will be saved and applied when using the snippet.
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name.trim() || !selectedNodeType}
        >
          {mode === 'edit' ? 'Save Changes' : 'Save Snippet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
