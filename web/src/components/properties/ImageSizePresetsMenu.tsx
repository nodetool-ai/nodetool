import React, { useCallback, useMemo, useState } from "react";

import {
  FlexRow,
  NodeTextField,
  EditorMenu,
  ListSubheader,
  MenuItemPrimitive,
  InputAdornment,
  Z_INDEX,
  ICON_SIZE
} from "../ui_primitives";
import Search from "@mui/icons-material/Search";
import { IMAGE_SIZE_PRESETS, PresetOption } from "../../config/constants";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";

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
  // Skipped on touch, where the virtual keyboard would cover the preset list.
  const autoFocusEnabled = useAutoFocusEnabled();

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
    <EditorMenu
      className="presets-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
      disableAutoFocusItem
      listSx={{ padding: 0 }}
      paperSx={{
        maxHeight: 450,
        width: "300px",
        // Keep each group title under the sticky search row.
        "& .MuiListSubheader-root": {
          position: "sticky",
          top: "48px",
          zIndex: Z_INDEX.dropdown
        }
      }}
    >
      <FlexRow className="presets-search-container" align="center" sx={{
        p: 1,
        position: 'sticky',
        top: 0,
        backgroundColor: (theme) => theme.vars.palette.Paper.overlay,
        zIndex: Z_INDEX.sticky,
        borderBottom: 1,
        borderColor: 'divider',
        height: '48px',
        boxSizing: 'border-box'
      }}>
        <NodeTextField
          className="presets-search-field"
          fullWidth
          placeholder="Search presets"
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          autoFocus={autoFocusEnabled}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: ICON_SIZE.sm }} />
              </InputAdornment>
            ),
            sx: { 
                fontSize: 'var(--fontSizeSmall)',
                height: '32px',
                '& .MuiInputBase-input': {
                    py: 0
                }
            }
          }}
        />
      </FlexRow>

      {Object.entries(filteredGroupedPresets).length === 0 ? (
        <MenuItemPrimitive label="No presets found" disabled />
      ) : (
        Object.entries(filteredGroupedPresets).map(([category, items]) => [
          <ListSubheader key={category} className="presets-category-header">{category}</ListSubheader>,
          ...items.map((preset) => (
            <MenuItemPrimitive
              className="preset-menu-item"
              key={`${preset.width}x${preset.height}-${preset.label}`}
              onClick={presetHandlers[`${preset.width}x${preset.height}-${preset.label}`]}
              selected={currentWidth === preset.width && currentHeight === preset.height}
              label={`${preset.width} × ${preset.height}`}
              secondary={[preset.aspectRatio, preset.label, preset.description]
                .filter(Boolean)
                .join(" · ")}
            />
          ))
        ])
      )}
    </EditorMenu>
  );
};
