/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useRef, useState } from "react";
import { Popover, IconButton, Tooltip, Box } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

interface NodeColorPickerProps {
  color: string | undefined;
  onColorChange: (color: string | undefined) => void;
  iconBaseColor?: string;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
];

const HUE_COLORS = [
  "#ff0000", "#ff8000", "#ffff00", "#80ff00",
  "#00ff00", "#00ff80", "#00ffff", "#0080ff",
  "#0000ff", "#8000ff", "#ff00ff", "#ff0080"
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { h: 0, s: 100, l: 50 };
  }
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export const NodeColorPicker: React.FC<NodeColorPickerProps> = memo(function NodeColorPicker({
  color,
  onColorChange,
  iconBaseColor
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tempColor, setTempColor] = useState(color || "#3b82f6");
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    const rgb = hexToRgb(color || "#3b82f6");
    if (rgb) {
      setTempColor(color || "#3b82f6");
    }
  }, [color]);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleHueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value, 10);
    setHue(newHue);
    const newColor = hslToHex(newHue, saturation, lightness);
    setTempColor(newColor);
  }, [saturation, lightness]);

  const handleSaturationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSat = parseInt(e.target.value, 10);
    setSaturation(newSat);
    const newColor = hslToHex(hue, newSat, lightness);
    setTempColor(newColor);
  }, [hue, lightness]);

  const handleLightnessChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newLight = parseInt(e.target.value, 10);
    setLightness(newLight);
    const newColor = hslToHex(hue, saturation, newLight);
    setTempColor(newColor);
  }, [hue, saturation]);

  const handleApply = useCallback(() => {
    onColorChange(tempColor);
    handleClose();
  }, [tempColor, onColorChange, handleClose]);

  const handleReset = useCallback(() => {
    onColorChange(undefined);
    handleClose();
  }, [onColorChange, handleClose]);

  const handlePresetClick = useCallback((presetColor: string) => {
    setTempColor(presetColor);
    const hsl = hexToHsl(presetColor);
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
  }, []);

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Change color" arrow>
        <IconButton
          ref={buttonRef}
          onClick={handleOpen}
          size="small"
          sx={{
            width: 24,
            height: 24,
            opacity: 0.7,
            "&:hover": {
              opacity: 1,
              backgroundColor: "rgba(255, 255, 255, 0.1)"
            }
          }}
        >
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: color || iconBaseColor || "transparent",
              border: color ? "2px solid rgba(255,255,255,0.3)" : "1px dashed rgba(255,255,255,0.3)"
            }}
          />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            p: 1.5
          }
        }}
      >
        <Box
          css={css({
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 200
          })}
        >
          <Box
            css={css({
              display: "flex",
              gap: 0.5,
              flexWrap: "wrap",
              justifyContent: "center"
            })}
          >
            {PRESET_COLORS.map((presetColor) => (
              <Box
                key={presetColor}
                onClick={() => handlePresetClick(presetColor)}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: presetColor,
                  cursor: "pointer",
                  border: tempColor === presetColor ? "2px solid white" : "2px solid transparent",
                  boxShadow: tempColor === presetColor
                    ? "0 0 0 2px #3b82f6"
                    : "none",
                  transition: "transform 0.1s ease",
                  "&:hover": {
                    transform: "scale(1.1)"
                  }
                }}
              />
            ))}
          </Box>

          <Box
            css={css({
              display: "flex",
              flexDirection: "column",
              gap: 8
            })}
          >
            <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
              <Box component="span" css={css({ fontSize: "0.7rem", width: 20, color: "text.secondary" })}>H</Box>
              <Box
                component="input"
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={handleHueChange}
                css={css({
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: `linear-gradient(to right, 
                    #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, 
                    #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)`
                })}
              />
            </Box>

            <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
              <Box component="span" css={css({ fontSize: "0.7rem", width: 20, color: "text.secondary" })}>S</Box>
              <Box
                component="input"
                type="range"
                min="0"
                max="100"
                value={saturation}
                onChange={handleSaturationChange}
                css={css({
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: `linear-gradient(to right, #888, ${hslToHex(hue, 100, 50)})`
                })}
              />
            </Box>

            <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
              <Box component="span" css={css({ fontSize: "0.7rem", width: 20, color: "text.secondary" })}>L</Box>
              <Box
                component="input"
                type="range"
                min="0"
                max="100"
                value={lightness}
                onChange={handleLightnessChange}
                css={css({
                  width: "100%",
                  height: 8,
                  borderRadius: 4,
                  cursor: "pointer",
                  background: `linear-gradient(to right, #000, ${hslToHex(hue, saturation, 50)}, #fff)`
                })}
              />
            </Box>
          </Box>

          <Box
            css={css({
              display: "flex",
              gap: 0.5,
              flexWrap: "wrap",
              justifyContent: "center"
            })}
          >
            {HUE_COLORS.map((hueColor) => (
              <Box
                key={hueColor}
                onClick={() => handlePresetClick(hueColor)}
                sx={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  backgroundColor: hueColor,
                  cursor: "pointer",
                  border: tempColor === hueColor ? "2px solid white" : "2px solid transparent",
                  boxShadow: tempColor === hueColor ? "0 0 0 2px #3b82f6" : "none"
                }}
              />
            ))}
          </Box>

          <Box
            css={css({
              display: "flex",
              gap: 1,
              justifyContent: "space-between",
              alignItems: "center",
              pt: 1,
              borderTop: "1px solid",
              borderColor: "divider"
            })}
          >
            <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: 1,
                  backgroundColor: tempColor,
                  border: "1px solid rgba(255,255,255,0.2)"
                }}
              />
              <Box
                component="span"
                css={css({
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "text.secondary"
                })}
              >
                {tempColor.toUpperCase()}
              </Box>
            </Box>

            <Box css={css({ display: "flex", gap: 0.5 })}>
              <Tooltip title="Reset to default" arrow>
                <IconButton
                  onClick={handleReset}
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    "&:hover": {
                      backgroundColor: "action.hover"
                    }
                  }}
                >
                  <RestartAltIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>

              <Box
                component="button"
                onClick={handleApply}
                sx={{
                  px: 2,
                  py: 0.5,
                  borderRadius: 1,
                  border: "none",
                  backgroundColor: "primary.main",
                  color: "primary.contrastText",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  "&:hover": {
                    backgroundColor: "primary.dark"
                  }
                }}
              >
                Apply
              </Box>
            </Box>
          </Box>
        </Box>
      </Popover>
    </>
  );
});
