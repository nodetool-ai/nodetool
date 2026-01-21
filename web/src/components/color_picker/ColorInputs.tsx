/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useCallback, useEffect, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { TextField, InputAdornment, Box } from "@mui/material";
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
} from "../../utils/colorConversion";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    ".color-input-row": {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    },
    ".color-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.vars.palette.grey[900],
        borderRadius: "4px",
        fontSize: "12px"
      },
      "& .MuiInputBase-input": {
        padding: "8px",
        textAlign: "center"
      },
      "& .MuiInputAdornment-root": {
        marginRight: 0
      },
      "& .MuiTypography-root": {
        fontSize: "11px",
        color: theme.vars.palette.grey[500]
      }
    },
    ".hex-input": {
      width: "100%"
    },
    ".component-input": {
      flex: 1,
      minWidth: 0
    }
  });

export type ColorMode = "hex" | "rgb" | "hsl" | "hsb" | "cmyk" | "lab";

interface ColorInputsProps {
  color: string; // hex color
  alpha: number; // 0-1
  mode: ColorMode;
  onChange: (hex: string, alpha: number) => void;
}

const ColorInputs: React.FC<ColorInputsProps> = ({
  color,
  alpha,
  mode,
  onChange
}) => {
  const theme = useTheme();
  
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

  useEffect(() => {
    setAlphaInput(Math.round(alpha * 100));
  }, [alpha]);

  // Handle hex input
  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      setHexInput(value);

      // Normalize and validate hex
      if (!value.startsWith("#")) {
        value = "#" + value;
      }

      // Check if valid hex
      if (/^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value)) {
        onChange(value, alpha);
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      setAlphaInput(value);
      onChange(color, value / 100);
    },
    [color, onChange]
  );

  const renderInputs = () => {
    switch (mode) {
      case "hex":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input hex-input"
              value={hexInput}
              onChange={handleHexChange}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">#</InputAdornment>
                )
              }}
              placeholder="FFFFFF"
            />
            <TextField
              className="color-input component-input"
              value={alphaInput}
              onChange={handleAlphaChange}
              type="number"
              size="small"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">%</InputAdornment>
                )
              }}
              inputProps={{ min: 0, max: 100 }}
              style={{ width: "80px" }}
            />
          </div>
        );

      case "rgb":
        return (
          <>
            <div className="color-input-row">
              <TextField
                className="color-input component-input"
                label="R"
                value={rgbInputs.r}
                onChange={(e) => handleRgbChange("r", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="G"
                value={rgbInputs.g}
                onChange={(e) => handleRgbChange("g", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="B"
                value={rgbInputs.b}
                onChange={(e) => handleRgbChange("b", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="A"
                value={alphaInput}
                onChange={handleAlphaChange}
                type="number"
                size="small"
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>
                }}
                inputProps={{ min: 0, max: 100 }}
              />
            </div>
          </>
        );

      case "hsl":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input component-input"
              label="H"
              value={hslInputs.h}
              onChange={(e) => handleHslChange("h", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 360 }}
            />
            <TextField
              className="color-input component-input"
              label="S"
              value={hslInputs.s}
              onChange={(e) => handleHslChange("s", e.target.value)}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="L"
              value={hslInputs.l}
              onChange={(e) => handleHslChange("l", e.target.value)}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="A"
              value={alphaInput}
              onChange={handleAlphaChange}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
          </div>
        );

      case "hsb":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input component-input"
              label="H"
              value={hsbInputs.h}
              onChange={(e) => handleHsbChange("h", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 360 }}
            />
            <TextField
              className="color-input component-input"
              label="S"
              value={hsbInputs.s}
              onChange={(e) => handleHsbChange("s", e.target.value)}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="B"
              value={hsbInputs.b}
              onChange={(e) => handleHsbChange("b", e.target.value)}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="A"
              value={alphaInput}
              onChange={handleAlphaChange}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
          </div>
        );

      case "cmyk":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input component-input"
              label="C"
              value={cmykInputs.c}
              onChange={(e) => handleCmykChange("c", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="M"
              value={cmykInputs.m}
              onChange={(e) => handleCmykChange("m", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="Y"
              value={cmykInputs.y}
              onChange={(e) => handleCmykChange("y", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="K"
              value={cmykInputs.k}
              onChange={(e) => handleCmykChange("k", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
          </div>
        );

      case "lab":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input component-input"
              label="L"
              value={labInputs.l}
              onChange={(e) => handleLabChange("l", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="a"
              value={labInputs.a}
              onChange={(e) => handleLabChange("a", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: -128, max: 127 }}
            />
            <TextField
              className="color-input component-input"
              label="b"
              value={labInputs.b}
              onChange={(e) => handleLabChange("b", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: -128, max: 127 }}
            />
            <TextField
              className="color-input component-input"
              label="A"
              value={alphaInput}
              onChange={handleAlphaChange}
              type="number"
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>
              }}
              inputProps={{ min: 0, max: 100 }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return <Box css={styles(theme)}>{renderInputs()}</Box>;
};

export default memo(ColorInputs);
