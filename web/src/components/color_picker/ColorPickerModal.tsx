/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Typography,
  Tabs,
  Tab,
  Tooltip,
  Button
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import { useCombo } from "../../stores/KeyPressedStore";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsb,
  hsbToRgb,
  rgbToHsl,
  getContrastingTextColor
} from "../../utils/colorConversion";
import { useColorPickerStore, GradientValue } from "../../stores/ColorPickerStore";
import SaturationPicker from "./SaturationPicker";
import HueSlider from "./HueSlider";
import AlphaSlider from "./AlphaSlider";
import ColorInputs, { ColorMode } from "./ColorInputs";
import ColorModeSelector from "./ColorModeSelector";
import HarmonyPicker from "./HarmonyPicker";
import GradientBuilder from "./GradientBuilder";
import SwatchPanel from "./SwatchPanel";
import ContrastChecker from "./ContrastChecker";
import EyedropperButton from "./EyedropperButton";

const styles = (theme: Theme) =>
  css({
    ".modal-overlay": {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)",
      zIndex: 10000,
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    ".modal-content": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      width: "90%",
      maxWidth: "720px",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".modal-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".modal-title": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".header-actions": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".modal-body": {
      display: "flex",
      flex: 1,
      overflow: "hidden"
    },
    ".picker-section": {
      flex: "0 0 320px",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      borderRight: `1px solid ${theme.vars.palette.grey[800]}`,
      overflow: "auto"
    },
    ".tabs-section": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },
    ".tab-content": {
      flex: 1,
      padding: "16px",
      overflow: "auto"
    },
    ".color-preview": {
      display: "flex",
      gap: "8px",
      marginTop: "8px"
    },
    ".preview-swatch": {
      flex: 1,
      height: "48px",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden"
    },
    ".preview-swatch-bg": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Checkerboard pattern for transparency
      backgroundImage: `
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%)
      `,
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"
    },
    ".preview-swatch-color": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    },
    ".preview-label": {
      fontSize: "10px",
      fontWeight: 600,
      position: "relative",
      zIndex: 1
    },
    ".copy-feedback": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "rgba(0,0,0,0.7)",
      borderRadius: "4px",
      padding: "4px 8px",
      color: "white",
      fontSize: "11px",
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    ".modal-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".footer-actions": {
      display: "flex",
      gap: "8px"
    }
  });

type TabType = "swatches" | "harmonies" | "gradient" | "contrast";

interface ColorPickerModalProps {
  color: string; // hex color
  alpha?: number; // 0-1
  onChange: (color: string, alpha: number) => void;
  onClose: () => void;
  showGradient?: boolean;
  showContrast?: boolean;
  contrastBackgroundColor?: string;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  color: initialColor,
  alpha: initialAlpha = 1,
  onChange,
  onClose,
  showGradient = true,
  showContrast = true,
  contrastBackgroundColor = "#ffffff"
}) => {
  const theme = useTheme();
  const { addRecentColor, preferredColorMode, setPreferredColorMode } =
    useColorPickerStore();

  // Internal state
  const [color, setColor] = useState(initialColor || "#ff0000");
  const [alpha, setAlpha] = useState(initialAlpha);
  const [colorMode, setColorMode] = useState<ColorMode>(preferredColorMode);
  const [activeTab, setActiveTab] = useState<TabType>("swatches");
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [gradient, setGradient] = useState<GradientValue>({
    type: "linear",
    angle: 90,
    stops: [
      { color: initialColor || "#ff0000", position: 0 },
      { color: "#0000ff", position: 100 }
    ]
  });

  // Convert hex to HSB for the picker
  const hsb = useMemo(() => {
    const rgb = hexToRgb(color);
    return rgbToHsb(rgb);
  }, [color]);

  // Handle escape key
  useCombo(["escape"], onClose);

  // Update parent when color changes
  useEffect(() => {
    onChange(color, alpha);
  }, [color, alpha, onChange]);

  // Handle saturation/brightness change
  const handleSaturationChange = useCallback(
    (s: number, b: number) => {
      const rgb = hsbToRgb({ h: hsb.h, s, b });
      setColor(rgbToHex(rgb));
    },
    [hsb.h]
  );

  // Handle hue change
  const handleHueChange = useCallback(
    (h: number) => {
      const rgb = hsbToRgb({ h, s: hsb.s, b: hsb.b });
      setColor(rgbToHex(rgb));
    },
    [hsb.s, hsb.b]
  );

  // Handle alpha change
  const handleAlphaChange = useCallback((a: number) => {
    setAlpha(a);
  }, []);

  // Handle color input change
  const handleInputChange = useCallback((hex: string, a: number) => {
    setColor(hex);
    setAlpha(a);
  }, []);

  // Handle color mode change
  const handleModeChange = useCallback(
    (mode: ColorMode) => {
      setColorMode(mode);
      setPreferredColorMode(mode);
    },
    [setPreferredColorMode]
  );

  // Handle color selection from swatches/harmonies
  const handleColorSelect = useCallback((newColor: string) => {
    setColor(newColor);
  }, []);

  // Handle eyedropper color pick
  const handleEyedropperPick = useCallback((pickedColor: string) => {
    setColor(pickedColor);
  }, []);

  // Copy color to clipboard
  const copyColor = useCallback(
    (format: string) => {
      let textToCopy = "";
      const rgb = hexToRgb(color);

      switch (format) {
        case "hex":
          textToCopy = alpha < 1 ? rgbToHex(rgb, true) : color;
          break;
        case "rgb":
          textToCopy =
            alpha < 1
              ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
              : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
          break;
        case "hsl": {
          const hsl = rgbToHsl(rgb);
          textToCopy =
            alpha < 1
              ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`
              : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
          break;
        }
        default:
          textToCopy = color;
      }

      navigator.clipboard.writeText(textToCopy);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 1500);
    },
    [color, alpha]
  );

  // Handle apply (save to recent and close)
  const handleApply = useCallback(() => {
    addRecentColor(color);
    onClose();
  }, [addRecentColor, color, onClose]);

  // Get text color for preview
  const textColor = useMemo(() => {
    const rgb = hexToRgb(color);
    const contrast = getContrastingTextColor(rgb);
    return rgbToHex(contrast);
  }, [color]);

  // Overlay click handler
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleApply();
      }
    },
    [handleApply]
  );

  const content = (
    <div css={styles(theme)}>
      <div className="modal-overlay" onClick={handleOverlayClick}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <Typography className="modal-title">Color Picker</Typography>
            <div className="header-actions">
              <EyedropperButton onColorPicked={handleEyedropperPick} />
              <Tooltip title="Close (Esc)">
                <IconButton size="small" onClick={handleApply}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          {/* Body */}
          <div className="modal-body">
            {/* Left: Main Picker */}
            <div className="picker-section">
              {/* Saturation/Brightness Picker */}
              <SaturationPicker
                hue={hsb.h}
                saturation={hsb.s}
                brightness={hsb.b}
                onChange={handleSaturationChange}
              />

              {/* Hue Slider */}
              <HueSlider hue={hsb.h} onChange={handleHueChange} />

              {/* Alpha Slider */}
              <AlphaSlider color={color} alpha={alpha} onChange={handleAlphaChange} />

              {/* Color Mode Selector */}
              <ColorModeSelector
                mode={colorMode}
                onChange={handleModeChange}
                showAllModes={true}
              />

              {/* Color Inputs */}
              <ColorInputs
                color={color}
                alpha={alpha}
                mode={colorMode}
                onChange={handleInputChange}
              />

              {/* Color Preview */}
              <div className="color-preview">
                <Tooltip title="Click to copy HEX">
                  <div
                    className="preview-swatch"
                    onClick={() => copyColor("hex")}
                  >
                    <div className="preview-swatch-bg" />
                    <div
                      className="preview-swatch-color"
                      style={{
                        backgroundColor: color,
                        opacity: alpha
                      }}
                    />
                    <span className="preview-label" style={{ color: textColor }}>
                      {color.toUpperCase()}
                    </span>
                    {copiedFormat === "hex" && (
                      <div className="copy-feedback">
                        <CheckIcon sx={{ fontSize: 12 }} /> Copied
                      </div>
                    )}
                  </div>
                </Tooltip>
              </div>
            </div>

            {/* Right: Tabs Section */}
            <div className="tabs-section">
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant="fullWidth"
              >
                <Tab value="swatches" label="Swatches" />
                <Tab value="harmonies" label="Harmonies" />
                {showGradient && <Tab value="gradient" label="Gradient" />}
                {showContrast && <Tab value="contrast" label="Contrast" />}
              </Tabs>

              <div className="tab-content">
                {activeTab === "swatches" && (
                  <SwatchPanel
                    currentColor={color}
                    onColorSelect={handleColorSelect}
                  />
                )}
                {activeTab === "harmonies" && (
                  <HarmonyPicker
                    color={color}
                    onColorSelect={handleColorSelect}
                  />
                )}
                {activeTab === "gradient" && showGradient && (
                  <GradientBuilder
                    gradient={gradient}
                    onChange={setGradient}
                    currentColor={color}
                  />
                )}
                {activeTab === "contrast" && showContrast && (
                  <ContrastChecker
                    foregroundColor={color}
                    backgroundColor={contrastBackgroundColor}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <Typography variant="caption" color="textSecondary">
              Press Esc to close
            </Typography>
            <div className="footer-actions">
              <Button variant="outlined" size="small" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleApply}
                sx={{ minWidth: "80px" }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default ColorPickerModal;
