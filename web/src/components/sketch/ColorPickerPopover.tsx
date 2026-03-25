/**
 * ColorPickerPopover
 *
 * Custom HSV gradient color picker in a MUI Popover.
 * Dismiss (backdrop/Escape/OK) keeps the picked color; × cancels and restores the pre-open color.
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
  Button,
  IconButton,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
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
  initialColor: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  anchorEl,
  color,
  initialColor,
  onColorChange,
  onClose
}) => {
  const open = Boolean(anchorEl);
  const [mode, setMode] = useState<ColorMode>("hex");

  // Parse current color
  const { r, g, b, a } = parseColorToRgba(color);
  const fgHex6 = colorToHex6(color);
  const hsl = rgbToHsl(r, g, b);
  const hsv = rgbToHsv(r, g, b);

  // Local hue state — prevents hue jump when dragging in desaturated areas
  const [localHue, setLocalHue] = useState<number>(hsv.h);
  const prevOpenRef = useRef(false);

  // Sync hue when picker opens (don't do it on every color change)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setLocalHue(rgbToHsv(r, g, b).h);
    }
    prevOpenRef.current = open;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Revert to the color captured when the picker opened, then close. */
  const handleCancel = useCallback(() => {
    onColorChange(initialColor);
    onClose();
  }, [initialColor, onColorChange, onClose]);

  /** Backdrop / Escape: keep the live-picked color (already in parent via onColorChange) and close. */
  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

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
      onClose={handleDismiss}
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
      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", minHeight: "22px", mt: "-6px", mr: "-6px", mb: "2px" }}>
        <Tooltip title="Cancel — keep previous color">
          <IconButton
            size="small"
            onClick={handleCancel}
            aria-label="Cancel color change"
            sx={{ p: "2px", color: "grey.400", "&:hover": { color: "grey.200", bgcolor: "rgba(255,255,255,0.06)" } }}
          >
            <CloseIcon sx={{ fontSize: "16px" }} />
          </IconButton>
        </Tooltip>
      </Box>

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

      {/* Opacity slider */}
      <Box sx={{ px: "4px" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Typography sx={{ fontSize: SKETCH_FONT.xs, color: "grey.400", minWidth: "24px" }}>A</Typography>
          <Slider
            value={Math.round(a * 100)}
            min={0}
            max={100}
            step={1}
            onChange={(_, val) => {
              const newA = (val as number) / 100;
              onColorChange(rgbaToCss({ r, g, b, a: newA }));
            }}
            sx={{
              height: "8px",
              padding: "0 !important",
              "& .MuiSlider-rail": {
                background: `linear-gradient(to right, rgba(${r},${g},${b},0) 0%, rgba(${r},${g},${b},1) 100%)`,
                opacity: 1,
                height: "8px",
                borderRadius: "3px"
              },
              "& .MuiSlider-track": { display: "none" },
              "& .MuiSlider-thumb": {
                width: "12px",
                height: "12px",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
                backgroundColor: `rgba(${r},${g},${b},${a})`,
                "&:hover, &.Mui-focusVisible": { boxShadow: "0 0 0 2px rgba(255,255,255,0.3)" }
              }
            }}
          />
          <Typography sx={{ fontSize: SKETCH_FONT.xs, color: "grey.400", minWidth: "28px", textAlign: "right" }}>
            {Math.round(a * 100)}%
          </Typography>
        </Box>
      </Box>

      {/* Color preview: old → new */}
      <Box sx={{ display: "flex", gap: "2px", height: "20px", borderRadius: "3px", overflow: "hidden" }}>
        <Box sx={{ flex: 1, backgroundColor: initialColor, border: "1px solid rgba(255,255,255,0.1)" }} />
        <Box sx={{ flex: 1, backgroundColor: color, border: "1px solid rgba(255,255,255,0.1)" }} />
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

      <Button
        size="small"
        variant="contained"
        onClick={handleDismiss}
        fullWidth
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
