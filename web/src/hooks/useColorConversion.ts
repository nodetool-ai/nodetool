import { useState, useEffect, useCallback } from "react";
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

/**
 * Custom hook for managing color conversion between different color formats.
 * Handles bidirectional conversion between HEX, RGB, HSL, HSB, CMYK, and LAB color models.
 *
 * @param color - Current hex color value
 * @param alpha - Current alpha value (0-1)
 * @param onChange - Callback fired when color or alpha changes
 * @returns Object containing color state in all formats and change handlers
 *
 * @example
 * const { state, handlers } = useColorConversion(
 *   "#ff0000",
 *   1.0,
 *   (newHex, newAlpha) => console.log(newHex, newAlpha)
 * );
 */
export function useColorConversion(
  color: string,
  alpha: number,
  onChange: (hex: string, alpha: number) => void
): UseColorConversionResult {
  // Local state for input values to allow typing
  const [hexInput, setHexInput] = useState(color);
  const [rgbInputs, setRgbInputs] = useState<RGB>({ r: 0, g: 0, b: 0 });
  const [hslInputs, setHslInputs] = useState<HSL>({ h: 0, s: 0, l: 0 });
  const [hsbInputs, setHsbInputs] = useState<HSB>({ h: 0, s: 0, b: 0 });
  const [cmykInputs, setCmykInputs] = useState<CMYK>({ c: 0, m: 0, y: 0, k: 0 });
  const [labInputs, setLabInputs] = useState<LAB>({ l: 0, a: 0, b: 0 });
  const [alphaInput, setAlphaInput] = useState(Math.round(alpha * 100));

  // Update local state when color changes externally
  useEffect(() => {
    setHexInput(color);
    const rgb = hexToRgb(color);
    setRgbInputs({ r: rgb.r, g: rgb.g, b: rgb.b });
    setHslInputs(rgbToHsl(rgb));
    setHsbInputs(rgbToHsb(rgb));
    setCmykInputs(rgbToCmyk(rgb));
    setLabInputs(rgbToLab(rgb));
  }, [color]);

  // Update alpha input when alpha changes externally
  useEffect(() => {
    setAlphaInput(Math.round(alpha * 100));
  }, [alpha]);

  // Handle hex input
  const handleHexChange = useCallback(
    (value: string) => {
      setHexInput(value);

      // Normalize and validate hex
      let normalizedValue = value;
      if (!normalizedValue.startsWith("#")) {
        normalizedValue = "#" + normalizedValue;
      }

      // Check if valid hex
      if (/^#[0-9A-Fa-f]{6}$/.test(normalizedValue) || /^#[0-9A-Fa-f]{3}$/.test(normalizedValue)) {
        onChange(normalizedValue, alpha);
      }
    },
    [onChange, alpha]
  );

  // Handle RGB inputs
  const handleRgbChange = useCallback(
    (component: "r" | "g" | "b", value: string) => {
      const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
      const newRgb = { ...rgbInputs, [component]: numValue };
      setRgbInputs(newRgb);

      const hex = rgbToHex(newRgb);
      onChange(hex, alpha);
    },
    [rgbInputs, onChange, alpha]
  );

  // Handle HSL inputs
  const handleHslChange = useCallback(
    (component: "h" | "s" | "l", value: string) => {
      let numValue = parseInt(value) || 0;

      if (component === "h") {
        numValue = Math.max(0, Math.min(360, numValue));
      } else {
        numValue = Math.max(0, Math.min(100, numValue));
      }

      const newHsl = { ...hslInputs, [component]: numValue };
      setHslInputs(newHsl);

      const rgb = hslToRgb(newHsl);
      const hex = rgbToHex(rgb);
      onChange(hex, alpha);
    },
    [hslInputs, onChange, alpha]
  );

  // Handle HSB inputs
  const handleHsbChange = useCallback(
    (component: "h" | "s" | "b", value: string) => {
      let numValue = parseInt(value) || 0;

      if (component === "h") {
        numValue = Math.max(0, Math.min(360, numValue));
      } else {
        numValue = Math.max(0, Math.min(100, numValue));
      }

      const newHsb = { ...hsbInputs, [component]: numValue };
      setHsbInputs(newHsb);

      const rgb = hsbToRgb(newHsb);
      const hex = rgbToHex(rgb);
      onChange(hex, alpha);
    },
    [hsbInputs, onChange, alpha]
  );

  // Handle CMYK inputs
  const handleCmykChange = useCallback(
    (component: "c" | "m" | "y" | "k", value: string) => {
      const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
      const newCmyk = { ...cmykInputs, [component]: numValue };
      setCmykInputs(newCmyk);

      const rgb = cmykToRgb(newCmyk);
      const hex = rgbToHex(rgb);
      onChange(hex, alpha);
    },
    [cmykInputs, onChange, alpha]
  );

  // Handle LAB inputs
  const handleLabChange = useCallback(
    (component: "l" | "a" | "b", value: string) => {
      let numValue = parseInt(value) || 0;

      if (component === "l") {
        numValue = Math.max(0, Math.min(100, numValue));
      } else {
        numValue = Math.max(-128, Math.min(127, numValue));
      }

      const newLab = { ...labInputs, [component]: numValue };
      setLabInputs(newLab);

      const rgb = labToRgb(newLab);
      const hex = rgbToHex(rgb);
      onChange(hex, alpha);
    },
    [labInputs, onChange, alpha]
  );

  // Handle alpha input
  const handleAlphaChange = useCallback(
    (value: string) => {
      const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
      setAlphaInput(numValue);
      onChange(color, numValue / 100);
    },
    [color, onChange]
  );

  return {
    state: {
      hexInput,
      rgbInputs,
      hslInputs,
      hsbInputs,
      cmykInputs,
      labInputs,
      alphaInput
    },
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
