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
import { SKETCH_CHECKERBOARD } from "./sketchStyles";
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", alignItems: "center" }}>

      {/* ── Swatches ── */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "6px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: "0.5rem", color: "grey.500", userSelect: "none" }}>FG</Typography>
          <Tooltip title="Foreground Color" placement="right">
            <Box
              onClick={handleFgClick}
              sx={{
                position: "relative",
                ...SKETCH_CHECKERBOARD,
                borderRadius: "3px",
                width: "24px",
                height: "24px",
                overflow: "hidden",
                cursor: "pointer",
                flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.2)"
              }}
            >
              <Box sx={{ position: "absolute", inset: 0, backgroundColor: fgHex6 }} />
            </Box>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: "0.5rem", color: "grey.500", userSelect: "none" }}>BG</Typography>
          <Tooltip title="Background Color" placement="right">
            <Box
              onClick={handleBgClick}
              sx={{
                position: "relative",
                ...SKETCH_CHECKERBOARD,
                borderRadius: "3px",
                width: "24px",
                height: "24px",
                overflow: "hidden",
                cursor: "pointer",
                flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.2)"
              }}
            >
              <Box sx={{ position: "absolute", inset: 0, backgroundColor: bgHex6 }} />
            </Box>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Swap / Reset ── */}
      <Box sx={{ display: "flex", alignItems: "center", width: "54px" }}>
        <Tooltip title="Swap Colors (X)" placement="right">
          <IconButton size="small" onClick={onSwapColors} sx={{ flex: 1, padding: "2px", borderRadius: "3px" }}>
            <SwapHorizIcon sx={{ fontSize: "13px" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset to B/W (D)" placement="right">
          <IconButton size="small" onClick={onResetColors} sx={{ flex: 1, padding: "2px", borderRadius: "3px" }}>
            <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, lineHeight: 1 }}>D</Typography>
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
