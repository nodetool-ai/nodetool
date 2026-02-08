/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Button
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
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
    ".color-swatch": {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      cursor: "pointer",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "transform 0.15s, box-shadow 0.15s",
      "&:hover": {
        transform: "scale(1.1)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        zIndex: 1
      }
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

const SwatchPanel: React.FC<SwatchPanelProps> = ({
  currentColor,
  onColorSelect
}) => {
  const theme = useTheme();
  const [presetsMenuAnchor, setPresetsMenuAnchor] = useState<HTMLElement | null>(null);
  const [swatchMenuAnchor, setSwatchMenuAnchor] = useState<{
    element: HTMLElement;
    swatchId: string;
  } | null>(null);

  const recentColors = useColorPickerStore((state) => state.recentColors);
  const swatches = useColorPickerStore((state) => state.swatches);
  const palettes = useColorPickerStore((state) => state.palettes);
  const addSwatch = useColorPickerStore((state) => state.addSwatch);
  const removeSwatch = useColorPickerStore((state) => state.removeSwatch);
  const clearRecentColors = useColorPickerStore((state) => state.clearRecentColors);
  const addPalette = useColorPickerStore((state) => state.addPalette);
  const removePalette = useColorPickerStore((state) => state.removePalette);

  const handleAddSwatch = useCallback(() => {
    addSwatch(currentColor);
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

  const handleRecentColorClick = useCallback(
    (color: string) => () => {
      handleColorSelect(color);
    },
    [handleColorSelect]
  );

  const handleSwatchColorClick = useCallback(
    (color: string) => () => {
      handleColorSelect(color);
    },
    [handleColorSelect]
  );

  const handlePaletteRemove = useCallback(
    (id: string) => () => {
      handleRemovePalette(id);
    },
    [handleRemovePalette]
  );

  const handlePaletteColorClick = useCallback(
    (color: string) => () => {
      handleColorSelect(color);
    },
    [handleColorSelect]
  );

  const handleLoadPresetPalette = useCallback(
    (palette: ColorPalette) => () => {
      handleLoadPreset(palette);
    },
    [handleLoadPreset]
  );

  // Memoize recent colors rendering to prevent unnecessary re-renders
  const recentColorsContent = useMemo(() => {
    if (recentColors.length === 0) {
      return <Typography className="empty-message">No recent colors</Typography>;
    }

    return recentColors.map((color, index) => (
      <Tooltip key={index} title={color}>
        <div
          className="color-swatch"
          style={{ backgroundColor: color }}
          onClick={handleRecentColorClick(color)}
        />
      </Tooltip>
    ));
  }, [recentColors, handleRecentColorClick]);

  // Memoize saved swatches rendering
  const savedSwatchesContent = useMemo(() => {
    return swatches.map((swatch) => (
      <Tooltip key={swatch.id} title={swatch.name || swatch.color}>
        <div
          className="color-swatch"
          style={{ backgroundColor: swatch.color }}
          onClick={handleSwatchColorClick(swatch.color)}
          onContextMenu={(e) => handleSwatchContextMenu(e, swatch.id)}
        />
      </Tooltip>
    ));
  }, [swatches, handleSwatchColorClick, handleSwatchContextMenu]);

  // Memoize user palettes rendering
  const userPalettesContent = useMemo(() => {
    if (palettes.length === 0) {
      return null;
    }

    return palettes.map((palette) => (
      <div key={palette.id} className="palette-section">
        <div className="palette-header">
          <Typography className="palette-name">{palette.name}</Typography>
          <IconButton size="small" onClick={handlePaletteRemove(palette.id)}>
            <DeleteIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </div>
        <div className="color-grid">
          {palette.colors.map((color, index) => (
            <Tooltip key={index} title={color}>
              <div
                className="color-swatch"
                style={{ backgroundColor: color }}
                onClick={handlePaletteColorClick(color)}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    ));
  }, [palettes, handlePaletteRemove, handlePaletteColorClick]);

  // Memoize preset palettes menu items
  const presetPalettesContent = useMemo(() => {
    return PRESET_PALETTES.map((palette) => (
      <MenuItem key={palette.id} onClick={handleLoadPresetPalette(palette)}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2">{palette.name}</Typography>
          <Box sx={{ display: "flex", gap: 0.25 }}>
            {palette.colors.slice(0, 6).map((color, i) => (
              <Box
                key={i}
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
    ));
  }, [handleLoadPresetPalette]);

  return (
    <Box css={styles(theme)}>
      {/* Recent Colors */}
      <div className="section">
        <div className="section-header">
          <Typography className="section-title">Recent</Typography>
          {recentColors.length > 0 && (
            <Tooltip title="Clear recent colors">
              <IconButton size="small" onClick={clearRecentColors}>
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </div>
        <div className="color-grid">
          {recentColorsContent}
        </div>
      </div>

      {/* Saved Swatches */}
      <div className="section">
        <div className="section-header">
          <Typography className="section-title">Saved</Typography>
        </div>
        <div className="color-grid">
          {savedSwatchesContent}
          <Tooltip title="Save current color">
            <div className="add-swatch-button" onClick={handleAddSwatch}>
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
          {userPalettesContent}
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
          {presetPalettesContent}
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
};

export default memo(SwatchPanel);
