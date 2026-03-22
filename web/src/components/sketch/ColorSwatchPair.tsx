/**
 * ColorSwatchPair
 *
 * Inline FG/BG color section for the left toolbar.
 * - Swatches are direct <input type="color"> — click opens native picker immediately.
 * - HEX / RGB / HSL mode toggle always visible below.
 * - Single text input area for the active (FG) color in the current mode.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Typography,
  Tooltip,
  IconButton
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import {
  ColorMode,
  parseColorToRgba,
  rgbaToCss,
  rgbToHsl,
  hslToRgb,
  colorToHex6
} from "./types";
import { SKETCH_CHECKERBOARD, SKETCH_FONT, toggleButtonSmallSx } from "./sketchStyles";

// Strip native chrome from <input type="color"> so it renders as a flat swatch
const swatchInputCss = css({
  "&[type=color]": {
    WebkitAppearance: "none",
    appearance: "none",
    width: "22px",
    height: "22px",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    padding: 0,
    background: "none",
    "&::-webkit-color-swatch-wrapper": { padding: 0 },
    "&::-webkit-color-swatch": { border: "none", borderRadius: "3px" }
  }
});

const numSx = {
  "& .MuiInputBase-input": {
    fontSize: SKETCH_FONT.xs,
    padding: "2px 3px",
    textAlign: "center" as const
  }
};

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
  useTheme(); // ensure theme context is present
  const [mode, setMode] = useState<ColorMode>("hex");

  const { r, g, b, a } = parseColorToRgba(foregroundColor);
  const fgHex6 = colorToHex6(foregroundColor);
  const bgHex6 = colorToHex6(backgroundColor);
  const hsl = rgbToHsl(r, g, b);

  // Native picker returns #rrggbb — preserve existing alpha
  const handleFgNative = (hex: string) => {
    const { r: nr, g: ng, b: nb } = parseColorToRgba(hex);
    onForegroundColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  };
  const handleBgNative = (hex: string) => {
    const { a: ba } = parseColorToRgba(backgroundColor);
    const { r: nr, g: ng, b: nb } = parseColorToRgba(hex);
    onBackgroundColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a: ba }));
  };

  const handleHex = (val: string) => {
    const cleaned = val.startsWith("#") ? val : `#${val}`;
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      const { r: nr, g: ng, b: nb } = parseColorToRgba(cleaned);
      onForegroundColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
    }
  };
  const handleRgb = (ch: "r" | "g" | "b", val: string) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(val) || 0)));
    onForegroundColorChange(rgbaToCss({
      r: ch === "r" ? n : r,
      g: ch === "g" ? n : g,
      b: ch === "b" ? n : b,
      a
    }));
  };
  const handleHsl = (ch: "h" | "s" | "l", val: string) => {
    const max = ch === "h" ? 360 : 100;
    const n = Math.max(0, Math.min(max, Math.round(Number(val) || 0)));
    const { r: nr, g: ng, b: nb } = hslToRgb(
      ch === "h" ? n : hsl.h,
      ch === "s" ? n : hsl.s,
      ch === "l" ? n : hsl.l
    );
    onForegroundColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>

      {/* ── Swatches + swap/reset ── */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "4px" }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: "0.5rem", color: "grey.500", userSelect: "none" }}>FG</Typography>
          <Tooltip title="Foreground Color" placement="right">
            <Box sx={{ position: "relative", ...SKETCH_CHECKERBOARD, borderRadius: "3px", width: "22px", height: "22px", overflow: "hidden" }}>
              <input
                css={swatchInputCss}
                type="color"
                value={fgHex6}
                onChange={(e) => handleFgNative(e.target.value)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
            </Box>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          <Typography sx={{ fontSize: "0.5rem", color: "grey.500", userSelect: "none" }}>BG</Typography>
          <Tooltip title="Background Color" placement="right">
            <Box sx={{ position: "relative", ...SKETCH_CHECKERBOARD, borderRadius: "3px", width: "22px", height: "22px", overflow: "hidden" }}>
              <input
                css={swatchInputCss}
                type="color"
                value={bgHex6}
                onChange={(e) => handleBgNative(e.target.value)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
            </Box>
          </Tooltip>
        </Box>

        <Tooltip title="Swap Colors (X)" placement="right">
          <IconButton size="small" onClick={onSwapColors} sx={{ padding: "2px", mb: "1px" }}>
            <SwapHorizIcon sx={{ fontSize: "13px" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset to B/W (D)" placement="right">
          <IconButton size="small" onClick={onResetColors} sx={{ padding: "2px", mb: "1px" }}>
            <Typography sx={{ fontSize: "0.55rem", fontWeight: 700, lineHeight: 1 }}>D</Typography>
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Mode toggle ── */}
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => v && setMode(v as ColorMode)}
        size="small"
        fullWidth
      >
        <ToggleButton value="hex" sx={toggleButtonSmallSx}>HEX</ToggleButton>
        <ToggleButton value="rgb" sx={toggleButtonSmallSx}>RGB</ToggleButton>
        <ToggleButton value="hsl" sx={toggleButtonSmallSx}>HSL</ToggleButton>
      </ToggleButtonGroup>

      {/* ── Mode inputs ── */}
      {mode === "hex" && (
        <TextField
          size="small"
          value={fgHex6}
          onChange={(e) => handleHex(e.target.value)}
          inputProps={{ maxLength: 7 }}
          sx={{
            "& .MuiInputBase-root": { fontSize: SKETCH_FONT.sm, height: "22px" },
            "& .MuiInputBase-input": { padding: "2px 4px", textAlign: "center" }
          }}
        />
      )}

      {mode === "rgb" && (
        <Box sx={{ display: "flex", gap: "2px" }}>
          {(["r", "g", "b"] as const).map((ch) => (
            <Box key={ch} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Typography sx={{ fontSize: "0.45rem", color: "grey.500" }}>{ch.toUpperCase()}</Typography>
              <TextField
                size="small"
                type="number"
                value={ch === "r" ? r : ch === "g" ? g : b}
                onChange={(e) => handleRgb(ch, e.target.value)}
                inputProps={{ min: 0, max: 255 }}
                sx={numSx}
              />
            </Box>
          ))}
        </Box>
      )}

      {mode === "hsl" && (
        <Box sx={{ display: "flex", gap: "2px" }}>
          {(["h", "s", "l"] as const).map((ch) => (
            <Box key={ch} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Typography sx={{ fontSize: "0.45rem", color: "grey.500" }}>
                {ch === "h" ? "H°" : ch === "s" ? "S%" : "L%"}
              </Typography>
              <TextField
                size="small"
                type="number"
                value={ch === "h" ? hsl.h : ch === "s" ? hsl.s : hsl.l}
                onChange={(e) => handleHsl(ch, e.target.value)}
                inputProps={{ min: 0, max: ch === "h" ? 360 : 100 }}
                sx={numSx}
              />
            </Box>
          ))}
        </Box>
      )}

    </Box>
  );
};

export default memo(ColorSwatchPair);
