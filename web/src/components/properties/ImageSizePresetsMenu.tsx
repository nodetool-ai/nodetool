import React, { useCallback, useMemo, useState } from "react";
import { Menu, MenuItem, ListSubheader, TextField, InputAdornment } from "@mui/material";
import { FlexColumn, FlexRow } from "../ui_primitives";
import Search from "@mui/icons-material/Search";
import { IMAGE_SIZE_PRESETS, PresetOption } from "../../config/constants";

interface ImageSizePresetsMenuProps {
  anchorEl: null | HTMLElement;
  open: boolean;
  onClose: () => void;
  onSelect: (preset: PresetOption) => void;
  currentWidth: number;
  currentHeight: number;
}

export const ImageSizePresetsMenu: React.FC<ImageSizePresetsMenuProps> = ({
  anchorEl,
  open,
  onClose,
  onSelect,
  currentWidth,
  currentHeight
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleClose = useCallback(() => {
    onClose();
    setSearchQuery("");
  }, [onClose]);

  const filteredGroupedPresets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const groups: Record<string, PresetOption[]> = {};

    IMAGE_SIZE_PRESETS.forEach(preset => {
      const match = preset.label.toLowerCase().includes(query) ||
                   (preset.description?.toLowerCase().includes(query)) ||
                   (preset.aspectRatio?.toLowerCase().includes(query));

      if (match) {
        const category = preset.category || "Other";
        if (!groups[category]) {groups[category] = [];}
        groups[category].push(preset);
      }
    });
    return groups;
  }, [searchQuery]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
  }, []);

  const handlePresetSelect = useCallback((preset: PresetOption) => {
    onSelect(preset);
  }, [onSelect]);

  // Memoize preset handlers to prevent recreation on each render
  const presetHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const preset of IMAGE_SIZE_PRESETS) {
      handlers[`${preset.width}x${preset.height}-${preset.label}`] = () => handlePresetSelect(preset);
    }
    return handlers;
  }, [handlePresetSelect]);

  return (
    <Menu
      className="presets-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
      disableAutoFocusItem
      MenuListProps={{
        sx: { padding: 0 }
      }}
      PaperProps={{
        sx: {
          maxHeight: 450,
          width: '300px',
          backgroundColor: 'background.paper',
          '& .MuiListSubheader-root': {
            lineHeight: '32px',
            backgroundColor: '#1E1E1E', 
            backgroundImage: 'none', 
            fontWeight: 'bold',
            color: 'primary.light',
            position: 'sticky',
            top: '48px',
            zIndex: 10,  
          }
        }
      }}
    >
      <FlexRow className="presets-search-container" align="center" sx={{
        p: 1,
        position: 'sticky',
        top: 0,
        backgroundColor: '#1E1E1E',
        zIndex: 11,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        height: '48px',
        boxSizing: 'border-box'
      }}>
        <TextField
          className="presets-search-field"
          fullWidth
          size="small"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: '1rem' }} />
              </InputAdornment>
            ),
            sx: { 
                fontSize: '0.8125rem',
                height: '32px',
                '& .MuiInputBase-input': {
                    py: 0
                }
            }
          }}
        />
      </FlexRow>

      {Object.entries(filteredGroupedPresets).length === 0 ? (
        <MenuItem disabled sx={{ fontSize: '0.8125rem' }}>No presets found</MenuItem>
      ) : (
        Object.entries(filteredGroupedPresets).map(([category, items]) => [
          <ListSubheader key={category} className="presets-category-header">{category}</ListSubheader>,
          ...items.map((preset) => (
            <MenuItem
              className="preset-menu-item"
              key={`${preset.width}x${preset.height}-${preset.label}`}
              onClick={presetHandlers[`${preset.width}x${preset.height}-${preset.label}`]}
              selected={currentWidth === preset.width && currentHeight === preset.height}
              sx={{ py: 1, px: 2 }}
            >
              <FlexColumn fullWidth>
                <span style={{ fontSize: '1rem', fontWeight: 500 }}>
                  {preset.width} × {preset.height}
                </span>
                <FlexRow gap={0.5} align="center" sx={{
                  fontSize: 'var(--fontSizeSmall)',
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <span>{preset.aspectRatio}</span>
                  <span>·</span>
                  <span>{preset.label}</span>
                  {preset.description && (
                    <>
                      <span>·</span>
                      <span>{preset.description}</span>
                    </>
                  )}
                </FlexRow>
              </FlexColumn>
            </MenuItem>
          ))
        ])
      )}
    </Menu>
  );
};
