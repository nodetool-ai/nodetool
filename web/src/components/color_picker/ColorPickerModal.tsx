/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Caption, Tooltip, FlexRow, FlexColumn, EditorButton, TabGroup } from "../ui_primitives";
import type { TabItem } from "../ui_primitives";
import { CloseButton } from "../ui_primitives";
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
      zIndex: 10000
    },
    ".modal-content": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "var(--rounded-xl)",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      width: "90%",
      maxWidth: "720px",
      maxHeight: "90vh",
      overflow: "hidden"
    },
    ".modal-header": {
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
      gap: "8px"
    },
    ".modal-body": {
      flex: 1,
      overflow: "hidden"
    },
    ".picker-section": {
      flex: "0 0 320px",
      padding: "16px",
      gap: "16px",
      borderRight: `1px solid ${theme.vars.palette.grey[800]}`,
      overflow: "auto"
    },
    ".tabs-section": {
      flex: 1,
      overflow: "hidden"
    },
    ".tab-content": {
      flex: 1,
      padding: "16px",
      overflow: "auto"
    },
    ".color-preview": {
      gap: "8px",
      marginTop: "8px"
    },
    ".preview-swatch": {
      flex: 1,
      height: "48px",
      borderRadius: "var(--rounded-lg)",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
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
      borderRadius: "var(--rounded-sm)",
      padding: "4px 8px",
      color: "white",
      fontSize: "11px",
      gap: "4px"
    },
    ".modal-footer": {
      justifyContent: "space-between",
      padding: "12px 16px",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".footer-actions": {
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
  // Combine multiple store subscriptions into a single selector to reduce re-renders
  const { addRecentColor, preferredColorMode, setPreferredColorMode } =
    useColorPickerStore(
      useCallback(
        (state) => ({
          addRecentColor: state.addRecentColor,
          preferredColorMode: state.preferredColorMode,
          setPreferredColorMode: state.setPreferredColorMode
        }),
        []
      )
    );

  // Internal state
  const [color, setColor] = useState(initialColor || "#ff0000");
  const [alpha, setAlpha] = useState(initialAlpha);
  const [colorMode, setColorMode] = useState<ColorMode>(preferredColorMode);
  const [activeTab, setActiveTab] = useState<TabType>("swatches");
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

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
    async (format: string) => {
      let textToCopy = "";
      const rgb = hexToRgb(color);

      switch (format) {
        case "hex":
          textToCopy = alpha < 1 ? rgbToHex({ ...rgb, a: alpha }, true) : color;
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

      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopiedFormat(format);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        window.alert(
          "Failed to copy the color to the clipboard. Please check your browser permissions and try again."
        );
        return;
      }

      // Clear previous timeout if exists
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }

      // Set new timeout and store reference
      copiedTimeoutRef.current = setTimeout(() => {
        setCopiedFormat(null);
        copiedTimeoutRef.current = null;
      }, 1500);
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

  const handleCopyHex = useCallback(() => {
    copyColor("hex");
  }, [copyColor]);

  const tabs: TabItem[] = useMemo(
    () => [
      { value: "swatches", label: "Swatches" },
      { value: "harmonies", label: "Harmonies" },
      ...(showGradient ? [{ value: "gradient", label: "Gradient" }] : []),
      ...(showContrast ? [{ value: "contrast", label: "Contrast" }] : [])
    ],
    [showContrast, showGradient]
  );

  const content = (
    <div css={styles(theme)}>
      <FlexRow
        className="modal-overlay"
        onClick={handleOverlayClick}
        align="center"
        justify="center"
        fullWidth
        fullHeight
      >
        <FlexColumn className="modal-content" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <FlexRow className="modal-header" align="center" justify="space-between" fullWidth>
            <Text className="modal-title">Color Picker</Text>
            <FlexRow className="header-actions" align="center">
              <EyedropperButton onColorPicked={handleEyedropperPick} />
              <CloseButton
                onClick={handleApply}
                tooltip="Close (Esc)"
                buttonSize="small"
              />
            </FlexRow>
          </FlexRow>

          {/* Body */}
          <FlexRow className="modal-body" fullWidth>
            {/* Left: Main Picker */}
            <FlexColumn className="picker-section">
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
              <FlexRow className="color-preview" align="center">
                <Tooltip title="Click to copy HEX">
                  <FlexRow
                    className="preview-swatch"
                    align="center"
                    justify="center"
                    onClick={handleCopyHex}
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
                      <FlexRow className="copy-feedback" align="center">
                        <CheckIcon sx={{ fontSize: 12 }} /> Copied
                      </FlexRow>
                    )}
                  </FlexRow>
                </Tooltip>
              </FlexRow>
            </FlexColumn>

            {/* Right: Tabs Section */}
            <FlexColumn className="tabs-section">
              <TabGroup
                tabs={tabs}
                value={activeTab}
                onChange={(value) => setActiveTab(value as TabType)}
                fullWidth
              />

              <FlexColumn className="tab-content">
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
              </FlexColumn>
            </FlexColumn>
          </FlexRow>

          {/* Footer */}
          <FlexRow className="modal-footer" align="center" justify="space-between" fullWidth>
            <Caption color="secondary">
              Press Esc to close
            </Caption>
            <FlexRow className="footer-actions" align="center">
              <EditorButton variant="outlined" density="compact" onClick={onClose}>
                Cancel
              </EditorButton>
              <EditorButton
                variant="contained"
                density="compact"
                onClick={handleApply}
                sx={{ minWidth: "80px" }}
              >
                Apply
              </EditorButton>
            </FlexRow>
          </FlexRow>
        </FlexColumn>
      </FlexRow>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

ColorPickerModal.displayName = 'ColorPickerModal';

export default memo(ColorPickerModal);
