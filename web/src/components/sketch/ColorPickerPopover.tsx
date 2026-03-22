/**
 * ColorPickerPopover
 *
 * Custom HSV gradient color picker in a MUI Popover.
 * - SV square: CSS gradient square, drag to pick saturation+value
 * - Hue slider: horizontal gradient bar
 * - HEX/RGB/HSL toggle + text inputs inside the popover
 * No external color picker library — built from scratch.
 */

/** @jsxImportSource @emotion/react */
import React, { memo, useState, useRef, useCallback, useEffect } from "react";
import {
  Popover,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Slider,
  Button
} from "@mui/material";
import {
  ColorMode,
  parseColorToRgba,
  rgbaToCss,
  rgbToHsl,
  hslToRgb,
  colorToHex6,
  rgbToHsv,
  hsvToRgb
} from "./types";
import { SKETCH_FONT, toggleButtonSmallSx } from "./sketchStyles";

const SV_SIZE = 160;
const HUE_HEIGHT = 12;

interface ColorPickerPopoverProps {
  anchorEl: HTMLElement | null;
  color: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  anchorEl,
  color,
  onColorChange,
  onClose
}) => {
  const open = Boolean(anchorEl);
  const [mode, setMode] = useState<ColorMode>("hex");

  // Capture the color when the picker opens so we can revert on discard
  const initialColorRef = useRef(color);
  const prevOpenRef = useRef(false);

  // Parse current color
  const { r, g, b, a } = parseColorToRgba(color);
  const fgHex6 = colorToHex6(color);
  const hsl = rgbToHsl(r, g, b);
  const hsv = rgbToHsv(r, g, b);

  // Local hue state — prevents hue jump when dragging in desaturated areas
  const [localHue, setLocalHue] = useState<number>(hsv.h);

  // On open: snapshot the initial color and sync hue
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      initialColorRef.current = color;
      setLocalHue(rgbToHsv(r, g, b).h);
    }
    prevOpenRef.current = open;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Discard: revert to the color at open time, then close
  const handleDiscard = useCallback(() => {
    onColorChange(initialColorRef.current);
    onClose();
  }, [onColorChange, onClose]);

  const svBoxRef = useRef<HTMLDivElement>(null);
  const draggingSv = useRef(false);

  const svToColor = useCallback((clientX: number, clientY: number) => {
    if (!svBoxRef.current) return;
    const rect = svBoxRef.current.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const { r: nr, g: ng, b: nb } = hsvToRgb(localHue, s, v);
    onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  }, [localHue, a, onColorChange]);

  const handleSvMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingSv.current = true;
    svToColor(e.clientX, e.clientY);
  }, [svToColor]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => { if (draggingSv.current) svToColor(e.clientX, e.clientY); };
    const onUp = () => { draggingSv.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open, svToColor]);

  const handleHueChange = (_: Event, val: number | number[]) => {
    const h = val as number;
    setLocalHue(h);
    const { r: nr, g: ng, b: nb } = hsvToRgb(h, hsv.s, hsv.v);
    onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  };

  const handleHex = (val: string) => {
    const cleaned = val.startsWith("#") ? val : `#${val}`;
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      const { r: nr, g: ng, b: nb } = parseColorToRgba(cleaned);
      onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
    }
  };

  const handleRgb = (ch: "r" | "g" | "b", val: string) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(val) || 0)));
    onColorChange(rgbaToCss({
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
    onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  };

  // Cursor position in SV square
  const cursorX = hsv.s * SV_SIZE;
  const cursorY = (1 - hsv.v) * SV_SIZE;

  const numSx = {
    "& .MuiInputBase-input": {
      fontSize: SKETCH_FONT.xs,
      padding: "2px 3px",
      textAlign: "center" as const
    }
  };

  const huePureColor = hsvToRgb(localHue, 1, 1);
  const huePureCss = `rgb(${huePureColor.r},${huePureColor.g},${huePureColor.b})`;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={handleDiscard}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: "grey.900",
            border: "1px solid",
            borderColor: "grey.700",
            borderRadius: "6px",
            p: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 10001,
            userSelect: "none"
          }
        }
      }}
    >
      {/* SV gradient square */}
      <Box
        ref={svBoxRef}
        onMouseDown={handleSvMouseDown}
        sx={{
          position: "relative",
          width: `${SV_SIZE}px`,
          height: `${SV_SIZE}px`,
          borderRadius: "4px",
          overflow: "hidden",
          cursor: "crosshair",
          flexShrink: 0
        }}
      >
        {/* Hue base layer */}
        <Box sx={{
          position: "absolute", inset: 0,
          backgroundColor: huePureCss
        }} />
        {/* White → transparent (left → right = saturation) */}
        <Box sx={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to right, #fff 0%, transparent 100%)"
        }} />
        {/* Black → transparent (bottom → top = value) */}
        <Box sx={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, #000 0%, transparent 100%)"
        }} />
        {/* Cursor circle */}
        <Box sx={{
          position: "absolute",
          left: `${cursorX}px`,
          top: `${cursorY}px`,
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none"
        }} />
      </Box>

      {/* Hue slider */}
      <Box sx={{ px: "4px" }}>
        <Slider
          value={localHue}
          min={0}
          max={360}
          step={1}
          onChange={handleHueChange}
          sx={{
            height: `${HUE_HEIGHT}px`,
            borderRadius: "3px",
            padding: "0 !important",
            "& .MuiSlider-rail": {
              background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
              opacity: 1,
              height: `${HUE_HEIGHT}px`,
              borderRadius: "3px"
            },
            "& .MuiSlider-track": { display: "none" },
            "& .MuiSlider-thumb": {
              width: "14px",
              height: "14px",
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
              backgroundColor: huePureCss,
              "&:hover, &.Mui-focusVisible": { boxShadow: "0 0 0 2px rgba(255,255,255,0.3)" }
            }
          }}
        />
      </Box>

      {/* Mode toggle */}
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

      {/* Mode inputs */}
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

      {/* Close button */}
      <Button
        size="small"
        variant="contained"
        onClick={onClose}
        sx={{
          fontSize: "0.65rem",
          py: "2px",
          minHeight: "24px",
          bgcolor: "grey.700",
          color: "grey.100",
          "&:hover": { bgcolor: "grey.600" },
          boxShadow: "none"
        }}
      >
        OK
      </Button>

    </Popover>
  );
};

export default memo(ColorPickerPopover);
