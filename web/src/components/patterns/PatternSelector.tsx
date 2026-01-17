import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Popover,
  TextField,
  InputAdornment,
  Typography,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
} from '@mui/material';
import {
  Search as SearchIcon,
  Category as CategoryIcon,
  Extension as ExtensionIcon,
} from '@mui/icons-material';
import { usePatternLibrary } from '../../hooks/patterns/usePatternLibrary';

interface PatternSelectorProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelectPattern: (patternId: string, position: { x: number; y: number }) => void;
  buttonRef: React.RefObject<HTMLElement>;
}

export const PatternSelector: React.FC<PatternSelectorProps> = ({
  anchorEl,
  onClose,
  onSelectPattern,
  buttonRef,
}) => {
  const { filteredPatterns, searchQuery, setSearchQuery, getCategories } = usePatternLibrary();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => getCategories(), [getCategories]);

  const open = Boolean(anchorEl);

  const handlePatternSelect = useCallback(
    (patternId: string) => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        onSelectPattern(patternId, { x: rect.right + 20, y: rect.top });
      }
      onClose();
    },
    [onSelectPattern, onClose, buttonRef]
  );

  const filteredByCategory = useMemo(() => {
    if (!selectedCategory) return filteredPatterns;
    return filteredPatterns.filter((p) => p.category === selectedCategory);
  }, [filteredPatterns, selectedCategory]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
      PaperProps={{
        sx: { width: 350, maxHeight: 500 },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <ExtensionIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Apply Pattern
          </Typography>
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

        {categories.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              size="small"
              label="All"
              onClick={() => setSelectedCategory(null)}
              color={selectedCategory === null ? 'primary' : 'default'}
              variant={selectedCategory === null ? 'filled' : 'outlined'}
            />
            {categories.slice(0, 5).map((cat) => (
              <Chip
                key={cat}
                size="small"
                label={cat}
                onClick={() => setSelectedCategory(cat)}
                color={selectedCategory === cat ? 'primary' : 'default'}
                variant={selectedCategory === cat ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        )}

        <Divider sx={{ mb: 1 }} />

        <List sx={{ maxHeight: 300, overflow: 'auto' }}>
          {filteredByCategory.length === 0 ? (
            <Box sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">No patterns found</Typography>
            </Box>
          ) : (
            filteredByCategory.slice(0, 10).map((pattern) => (
              <ListItemButton
                key={pattern.id}
                onClick={() => handlePatternSelect(pattern.id)}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <ListItemIcon>
                  <CategoryIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={pattern.name}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {pattern.tags.slice(0, 2).map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          sx={{ height: 16, fontSize: '0.6rem' }}
                        />
                      ))}
                    </Box>
                  }
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontWeight: 500 },
                  }}
                  secondaryTypographyProps={{
                    component: 'div',
                  }}
                />
              </ListItemButton>
            ))
          )}
        </List>

        <Divider sx={{ my: 1 }} />

        <Box sx={{ textAlign: 'center' }}>
          <Button
            size="small"
            onClick={() => {
              onClose();
            }}
          >
            Open Pattern Library
          </Button>
        </Box>
      </Box>
    </Popover>
  );
};

export default PatternSelector;
