import { useState, useEffect, useCallback, useRef } from "react";
import {
  RGB,
  HSL,
  HSB,
  CMYK,
  LAB,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsb,
  hsbToRgb,
  rgbToCmyk,
  cmykToRgb,
  rgbToLab,
  labToRgb
} from "../utils/colorConversion";

export type ColorMode = "hex" | "rgb" | "hsl" | "hsb" | "cmyk" | "lab";

export interface ColorConversionState {
  hexInput: string;
  rgbInputs: RGB;
  hslInputs: HSL;
  hsbInputs: HSB;
  cmykInputs: CMYK;
  labInputs: LAB;
  alphaInput: number;
}

export interface ColorConversionHandlers {
  handleHexChange: (value: string) => void;
  handleRgbChange: (component: "r" | "g" | "b", value: string) => void;
  handleHslChange: (component: "h" | "s" | "l", value: string) => void;
  handleHsbChange: (component: "h" | "s" | "b", value: string) => void;
  handleCmykChange: (component: "c" | "m" | "y" | "k", value: string) => void;
  handleLabChange: (component: "l" | "a" | "b", value: string) => void;
  handleAlphaChange: (value: string) => void;
}

export interface UseColorConversionResult {
  state: ColorConversionState;
  handlers: ColorConversionHandlers;
}

function computeAllFormats(color: string, alpha: number): ColorConversionState {
  const rgb = hexToRgb(color);
  return {
    hexInput: color,
    rgbInputs: { r: rgb.r, g: rgb.g, b: rgb.b },
    hslInputs: rgbToHsl(rgb),
    hsbInputs: rgbToHsb(rgb),
    cmykInputs: rgbToCmyk(rgb),
    labInputs: rgbToLab(rgb),
    alphaInput: Math.round(alpha * 100)
  };
}

export function useColorConversion(
  color: string,
  alpha: number,
  onChange: (hex: string, alpha: number) => void
): UseColorConversionResult {
  const [state, setState] = useState<ColorConversionState>(() =>
    computeAllFormats(color, alpha)
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(computeAllFormats(color, alpha));
  }, [color, alpha]);

  const handleHexChange = useCallback(
    (value: string) => {
      setState((prev) => ({ ...prev, hexInput: value }));

      let normalizedValue = value;
      if (!normalizedValue.startsWith("#")) {
        normalizedValue = "#" + normalizedValue;
      }

      if (/^#[0-9A-Fa-f]{6}$/.test(normalizedValue) || /^#[0-9A-Fa-f]{3}$/.test(normalizedValue)) {
        onChange(normalizedValue, alpha);
      }
    },
    [onChange, alpha]
  );

  const handleRgbChange = useCallback(
    (component: "r" | "g" | "b", value: string) => {
      const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
      const newRgb = { ...stateRef.current.rgbInputs, [component]: numValue };
      setState((prev) => ({ ...prev, rgbInputs: newRgb }));
      onChange(rgbToHex(newRgb), alpha);
    },
    [onChange, alpha]
  );

  const handleHslChange = useCallback(
    (component: "h" | "s" | "l", value: string) => {
      let numValue = parseInt(value) || 0;
      if (component === "h") {
        numValue = Math.max(0, Math.min(360, numValue));
      } else {
        numValue = Math.max(0, Math.min(100, numValue));
      }

      const newHsl = { ...stateRef.current.hslInputs, [component]: numValue };
      setState((prev) => ({ ...prev, hslInputs: newHsl }));
      onChange(rgbToHex(hslToRgb(newHsl)), alpha);
    },
    [onChange, alpha]
  );

  const handleHsbChange = useCallback(
    (component: "h" | "s" | "b", value: string) => {
      let numValue = parseInt(value) || 0;
      if (component === "h") {
        numValue = Math.max(0, Math.min(360, numValue));
      } else {
        numValue = Math.max(0, Math.min(100, numValue));
      }

      const newHsb = { ...stateRef.current.hsbInputs, [component]: numValue };
      setState((prev) => ({ ...prev, hsbInputs: newHsb }));
      onChange(rgbToHex(hsbToRgb(newHsb)), alpha);
    },
    [onChange, alpha]
  );

  const handleCmykChange = useCallback(
    (component: "c" | "m" | "y" | "k", value: string) => {
      const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
      const newCmyk = { ...stateRef.current.cmykInputs, [component]: numValue };
      setState((prev) => ({ ...prev, cmykInputs: newCmyk }));
      onChange(rgbToHex(cmykToRgb(newCmyk)), alpha);
    },
    [onChange, alpha]
  );

  const handleLabChange = useCallback(
    (component: "l" | "a" | "b", value: string) => {
      let numValue = parseInt(value) || 0;
      if (component === "l") {
        numValue = Math.max(0, Math.min(100, numValue));
      } else {
        numValue = Math.max(-128, Math.min(127, numValue));
      }

      const newLab = { ...stateRef.current.labInputs, [component]: numValue };
      setState((prev) => ({ ...prev, labInputs: newLab }));
      onChange(rgbToHex(labToRgb(newLab)), alpha);
    },
    [onChange, alpha]
  );

  const handleAlphaChange = useCallback(
    (value: string) => {
      const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
      setState((prev) => ({ ...prev, alphaInput: numValue }));
      onChange(color, numValue / 100);
    },
    [color, onChange]
  );

  return {
    state,
    handlers: {
      handleHexChange,
      handleRgbChange,
      handleHslChange,
      handleHsbChange,
      handleCmykChange,
      handleLabChange,
      handleAlphaChange
    }
  };
}
