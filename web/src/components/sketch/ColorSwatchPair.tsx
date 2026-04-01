/**
 * ColorSwatchPair
 *
 * FG/BG color swatches for the left toolbar.
 * Clicking a swatch opens ColorPickerPopover (custom HSV picker).
 * Swap and Reset buttons below the swatches.
 */

import React, { memo, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { colorToHex6 } from "./types";
import { SKETCH_CHECKERBOARD, SKETCH_FONT, SKETCH_SPACING, SKETCH_COLORS, colorSwatchSx } from "./sketchStyles";
import ColorPickerPopover from "./ColorPickerPopover";

export interface ColorSwatchPairProps {
  foregroundColor: string;
  backgroundColor: string;
  onForegroundColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onSwapColors: () => void;
  onResetColors: () => void;
}

const ColorSwatchPair: React.FC<ColorSwatchPairProps> = ({
  foregroundColor,
  backgroundColor,
  onForegroundColorChange,
  onBackgroundColorChange,
  onSwapColors,
  onResetColors
}) => {
  const [fgAnchor, setFgAnchor] = useState<HTMLElement | null>(null);
  const [bgAnchor, setBgAnchor] = useState<HTMLElement | null>(null);
  const [fgInitialColor, setFgInitialColor] = useState(foregroundColor);
  const [bgInitialColor, setBgInitialColor] = useState(backgroundColor);

  const fgHex6 = colorToHex6(foregroundColor);
  const bgHex6 = colorToHex6(backgroundColor);

  const handleFgClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setFgInitialColor(foregroundColor);
    setFgAnchor(e.currentTarget);
  }, [foregroundColor]);
  const handleBgClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setBgInitialColor(backgroundColor);
    setBgAnchor(e.currentTarget);
  }, [backgroundColor]);

  return (
    <Box className="color-swatch-pair" sx={{ display: "flex", flexDirection: "column", gap: SKETCH_SPACING.sm, width: "100%", alignItems: "center" }}>

      {/* ── Swatches ── */}
      <Box className="color-swatch-pair__swatches" sx={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: SKETCH_SPACING.md }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: SKETCH_FONT.xxs, color: SKETCH_COLORS.textMuted, userSelect: "none" }}>FG</Typography>
          <Tooltip title="Foreground Color" placement="right">
            <Box
              className="color-swatch-pair__fg"
              onClick={handleFgClick}
              sx={colorSwatchSx}
            >
              <Box sx={{ position: "absolute", inset: 0, backgroundColor: fgHex6 }} />
            </Box>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: SKETCH_FONT.xxs, color: SKETCH_COLORS.textMuted, userSelect: "none" }}>BG</Typography>
          <Tooltip title="Background Color" placement="right">
            <Box
              className="color-swatch-pair__bg"
              onClick={handleBgClick}
              sx={colorSwatchSx}
            >
              <Box sx={{ position: "absolute", inset: 0, backgroundColor: bgHex6 }} />
            </Box>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Swap / Reset ── */}
      <Box className="color-swatch-pair__actions" sx={{ display: "flex", alignItems: "center", width: "54px" }}>
        <Tooltip title="Swap Colors (X)" placement="right">
          <IconButton size="small" onClick={onSwapColors} sx={{ flex: 1, padding: SKETCH_SPACING.xs, borderRadius: "3px" }}>
            <SwapHorizIcon sx={{ fontSize: "13px" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset to B/W (D)" placement="right">
          <IconButton size="small" onClick={onResetColors} sx={{ flex: 1, padding: SKETCH_SPACING.xs, borderRadius: "3px" }}>
            <Typography sx={{ fontSize: SKETCH_FONT.xxs, fontWeight: 700, lineHeight: 1 }}>D</Typography>
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Pickers ── */}
      <ColorPickerPopover
        anchorEl={fgAnchor}
        color={foregroundColor}
        initialColor={fgInitialColor}
        onColorChange={onForegroundColorChange}
        onClose={() => setFgAnchor(null)}
      />
      <ColorPickerPopover
        anchorEl={bgAnchor}
        color={backgroundColor}
        initialColor={bgInitialColor}
        onColorChange={onBackgroundColorChange}
        onClose={() => setBgAnchor(null)}
      />

    </Box>
  );
};

export default memo(ColorSwatchPair);
