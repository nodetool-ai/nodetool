import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Label as LabelIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Category as CategoryIcon,
} from '@mui/icons-material';
import { usePatternLibrary } from '../../hooks/patterns/usePatternLibrary';
import { getPatternCategories } from '../../stores/research/PatternStore';

interface PatternLibraryPanelProps {
  onApplyPattern?: (patternId: string) => void;
}

export const PatternLibraryPanel: React.FC<PatternLibraryPanelProps> = ({ onApplyPattern }) => {
  const {
    patterns,
    filteredPatterns,
    searchQuery,
    setSearchQuery,
    addPattern,
    duplicatePattern,
    deletePattern,
    applyPattern,
    createPatternFromSelection,
    getCategories,
  } = usePatternLibrary();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuPatternId, setMenuPatternId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPatternName, setNewPatternName] = useState('');
  const [newPatternDescription, setNewPatternDescription] = useState('');
  const [newPatternCategory, setNewPatternCategory] = useState('');
  const [newPatternTags, setNewPatternTags] = useState('');
  const [isCreatingFromSelection, setIsCreatingFromSelection] = useState(false);

  const categories = getCategories();

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, patternId: string) => {
    setAnchorEl(event.currentTarget);
    setMenuPatternId(patternId);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setMenuPatternId(null);
  }, []);

  const handleDuplicate = useCallback(() => {
    if (menuPatternId) {
      duplicatePattern(menuPatternId);
    }
    handleMenuClose();
  }, [menuPatternId, duplicatePattern, handleMenuClose]);

  const handleDelete = useCallback(() => {
    if (menuPatternId && window.confirm('Are you sure you want to delete this pattern?')) {
      deletePattern(menuPatternId);
    }
    handleMenuClose();
  }, [menuPatternId, deletePattern, handleMenuClose]);

  const handleApply = useCallback(
    (patternId: string) => {
      applyPattern(patternId);
      if (onApplyPattern) {
        onApplyPattern(patternId);
      }
    },
    [applyPattern, onApplyPattern]
  );

  const handleCreatePattern = useCallback(() => {
    if (!newPatternName.trim()) return;

    const tags = newPatternTags.split(',').map((t) => t.trim()).filter(Boolean);

    if (isCreatingFromSelection) {
      try {
        const patternId = createPatternFromSelection(newPatternName, newPatternDescription, newPatternCategory || 'Custom', tags);
        console.log('Created pattern from selection:', patternId);
      } catch (error) {
        console.error('Failed to create pattern from selection:', error);
        return;
      }
    } else {
      addPattern({
        name: newPatternName,
        description: newPatternDescription,
        category: newPatternCategory || 'Custom',
        tags,
        nodes: [],
        edges: [],
      });
    }

    setCreateDialogOpen(false);
    setNewPatternName('');
    setNewPatternDescription('');
    setNewPatternCategory('');
    setNewPatternTags('');
    setIsCreatingFromSelection(false);
  }, [newPatternName, newPatternDescription, newPatternCategory, newPatternTags, isCreatingFromSelection, addPattern, createPatternFromSelection]);

  const openCreateDialog = useCallback((fromSelection: boolean) => {
    setIsCreatingFromSelection(fromSelection);
    setCreateDialogOpen(true);
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Pattern Library
        </Typography>
        <Box>
          <Tooltip title="Create from Selection">
            <span>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => openCreateDialog(true)}
                sx={{ mr: 1 }}
              >
                From Selection
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => openCreateDialog(false)}
          >
            New
          </Button>
        </Box>
      </Box>

      <TextField
        fullWidth
        size="small"
        placeholder="Search patterns..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredPatterns.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography variant="body2">No patterns found</Typography>
            <Typography variant="caption" color="text.secondary">
              Create a new pattern or search with different terms
            </Typography>
          </Box>
        ) : (
          filteredPatterns.map((pattern) => (
            <Box
              key={pattern.id}
              sx={{
                p: 2,
                mb: 1,
                borderRadius: 1,
                bgcolor: 'background.default',
                border: 1,
                borderColor: 'divider',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {pattern.name}
                    </Typography>
                    <Chip
                      size="small"
                      label={pattern.category}
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {pattern.description}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {pattern.tags.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem' }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Used {pattern.usageCount} times
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Apply Pattern">
                    <IconButton size="small" onClick={() => handleApply(pattern.id)}>
                      <PlayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small" onClick={(e) => handleMenuOpen(e, pattern.id)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleMenuClose}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ListItemIcon>
            <CopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {isCreatingFromSelection ? 'Create Pattern from Selection' : 'Create New Pattern'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              autoFocus
              label="Pattern Name"
              fullWidth
              value={newPatternName}
              onChange={(e) => setNewPatternName(e.target.value)}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={newPatternDescription}
              onChange={(e) => setNewPatternDescription(e.target.value)}
            />
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={newPatternCategory}
                label="Category"
                onChange={(e) => setNewPatternCategory(e.target.value)}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
                <MenuItem value="Custom">Custom</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Tags (comma-separated)"
              fullWidth
              value={newPatternTags}
              onChange={(e) => setNewPatternTags(e.target.value)}
              placeholder="e.g., image, processing, resize"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreatePattern}
            disabled={!newPatternName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PatternLibraryPanel;
