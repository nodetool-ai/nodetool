/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Tooltip,
  Menu,
  MenuItem,
  Button
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { DeleteButton, ColorSwatch } from "../ui_primitives";
import {
  useColorPickerStore,
  PRESET_PALETTES,
  ColorPalette
} from "../../stores/ColorPickerStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    ".section": {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    ".section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".section-title": {
      fontSize: "12px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      textTransform: "uppercase"
    },
    ".color-grid": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px"
    },
    ".add-swatch-button": {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      border: `1px dashed ${theme.vars.palette.grey[600]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      color: theme.vars.palette.grey[500],
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main
      }
    },
    ".palette-section": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: "6px"
    },
    ".palette-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".palette-name": {
      fontSize: "11px",
      fontWeight: 500,
      color: theme.vars.palette.grey[400]
    },
    ".empty-message": {
      fontSize: "11px",
      color: theme.vars.palette.grey[600],
      fontStyle: "italic",
      padding: "8px"
    }
  });

interface SwatchPanelProps {
  currentColor: string;
  onColorSelect: (color: string) => void;
}

const SwatchPanel: React.FC<SwatchPanelProps> = React.memo(({
  currentColor,
  onColorSelect
}) => {
  const theme = useTheme();
  const [presetsMenuAnchor, setPresetsMenuAnchor] = useState<HTMLElement | null>(null);
  const [swatchMenuAnchor, setSwatchMenuAnchor] = useState<{
    element: HTMLElement;
    swatchId: string;
  } | null>(null);

  // Combine multiple store subscriptions into a single selector to reduce re-renders
  const {
    recentColors,
    swatches,
    palettes,
    addSwatch,
    removeSwatch,
    clearRecentColors,
    addPalette,
    removePalette
  } = useColorPickerStore(
    useCallback(
      (state) => ({
        recentColors: state.recentColors,
        swatches: state.swatches,
        palettes: state.palettes,
        addSwatch: state.addSwatch,
        removeSwatch: state.removeSwatch,
        clearRecentColors: state.clearRecentColors,
        addPalette: state.addPalette,
        removePalette: state.removePalette
      }),
      []
    )
  );

  const handleAddSwatch = useCallback(() => {
    addSwatch(currentColor);
  }, [addSwatch, currentColor]);

  const handleAddSwatchKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      addSwatch(currentColor);
    }
  }, [addSwatch, currentColor]);

  const handleSwatchContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, swatchId: string) => {
      e.preventDefault();
      setSwatchMenuAnchor({ element: e.currentTarget, swatchId });
    },
    []
  );

  const handleDeleteSwatch = useCallback(() => {
    if (swatchMenuAnchor) {
      removeSwatch(swatchMenuAnchor.swatchId);
      setSwatchMenuAnchor(null);
    }
  }, [swatchMenuAnchor, removeSwatch]);

  const handleLoadPreset = useCallback(
    (palette: ColorPalette) => {
      addPalette(palette.name, palette.colors);
      setPresetsMenuAnchor(null);
    },
    [addPalette]
  );

  const handleColorSelect = useCallback(
    (color: string) => {
      onColorSelect(color);
    },
    [onColorSelect]
  );

  const handleRemovePalette = useCallback(
    (id: string) => {
      removePalette(id);
    },
    [removePalette]
  );

  const handlePresetsMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      setPresetsMenuAnchor(e.currentTarget);
    },
    []
  );

  const handlePresetsMenuClose = useCallback(() => {
    setPresetsMenuAnchor(null);
  }, []);

  const handleSwatchMenuClose = useCallback(() => {
    setSwatchMenuAnchor(null);
  }, []);

  const handlePaletteRemove = useCallback(
    (id: string) => () => {
      handleRemovePalette(id);
    },
    [handleRemovePalette]
  );

  const handleLoadPresetPalette = useCallback(
    (palette: ColorPalette) => () => {
      handleLoadPreset(palette);
    },
    [handleLoadPreset]
  );

  return (
    <Box css={styles(theme)}>
      {/* Recent Colors */}
      <div className="section">
        <div className="section-header">
          <Typography className="section-title">Recent</Typography>
          {recentColors.length > 0 && (
            <DeleteButton
              onClick={clearRecentColors}
              tooltip="Clear recent colors"
              iconVariant="clear"
              nodrag={false}
            />
          )}
        </div>
        <div className="color-grid">
          {recentColors.length > 0 ? (
            recentColors.map((color) => (
              <ColorSwatch
                key={color}
                color={color}
                onClick={handleColorSelect}
                showTooltip
                tooltip={color}
              />
            ))
          ) : (
            <Typography className="empty-message">No recent colors</Typography>
          )}
        </div>
      </div>

      {/* Saved Swatches */}
      <div className="section">
        <div className="section-header">
          <Typography className="section-title">Saved</Typography>
        </div>
        <div className="color-grid">
          {swatches.map((swatch) => (
            <ColorSwatch
              key={swatch.id}
              color={swatch.color}
              onClick={handleColorSelect}
              showTooltip
              tooltip={swatch.name || swatch.color}
              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => handleSwatchContextMenu(e, swatch.id)}
            />
          ))}
          <Tooltip title="Save current color">
            <div
              className="add-swatch-button"
              onClick={handleAddSwatch}
              onKeyDown={handleAddSwatchKeyDown}
              role="button"
              tabIndex={0}
              aria-label="Save current color as swatch"
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </div>
          </Tooltip>
        </div>
      </div>

      {/* User Palettes */}
      {palettes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <Typography className="section-title">Palettes</Typography>
          </div>
          {palettes.map((palette) => (
            <div key={palette.id} className="palette-section">
              <div className="palette-header">
                <Typography className="palette-name">{palette.name}</Typography>
                <DeleteButton
                  onClick={handlePaletteRemove(palette.id)}
                  tooltip={`Remove palette ${palette.name}`}
                  iconVariant="clear"
                  nodrag={false}
                />
              </div>
              <div className="color-grid">
                {palette.colors.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    onClick={handleColorSelect}
                    showTooltip
                    tooltip={color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preset Palettes */}
      <div className="section">
        <div className="section-header">
          <Typography className="section-title">Presets</Typography>
          <Button
            size="small"
            startIcon={<FolderOpenIcon />}
            onClick={handlePresetsMenuOpen}
          >
            Load
          </Button>
        </div>
        <Menu
          anchorEl={presetsMenuAnchor}
          open={Boolean(presetsMenuAnchor)}
          onClose={handlePresetsMenuClose}
        >
          {PRESET_PALETTES.map((palette) => (
            <MenuItem key={palette.id} onClick={handleLoadPresetPalette(palette)}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2">{palette.name}</Typography>
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  {palette.colors.slice(0, 6).map((color, i) => (
                    <Box
                      key={`${palette.id}-${color}-${i}`}
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: 0.5,
                        backgroundColor: color
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </MenuItem>
          ))}
        </Menu>
      </div>

      {/* Swatch Context Menu */}
      <Menu
        anchorEl={swatchMenuAnchor?.element}
        open={Boolean(swatchMenuAnchor)}
        onClose={handleSwatchMenuClose}
      >
        <MenuItem onClick={handleDeleteSwatch}>
          <DeleteIcon sx={{ fontSize: 16, mr: 1 }} /> Delete
        </MenuItem>
      </Menu>
    </Box>
  );
});

SwatchPanel.displayName = 'SwatchPanel';

export default memo(SwatchPanel);
