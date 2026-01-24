/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { TextField, InputAdornment, Box } from "@mui/material";
import { useColorConversion, ColorMode } from "../../hooks/useColorConversion";

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

export { ColorMode };

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
  
  // Use the extracted color conversion hook
  const { state, handlers } = useColorConversion(color, alpha, onChange);

  const renderInputs = () => {
    switch (mode) {
      case "hex":
        return (
          <div className="color-input-row">
            <TextField
              className="color-input hex-input"
              value={state.hexInput}
              onChange={(e) => handlers.handleHexChange(e.target.value)}
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
              value={state.alphaInput}
              onChange={(e) => handlers.handleAlphaChange(e.target.value)}
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
                value={state.rgbInputs.r}
                onChange={(e) => handlers.handleRgbChange("r", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="G"
                value={state.rgbInputs.g}
                onChange={(e) => handlers.handleRgbChange("g", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="B"
                value={state.rgbInputs.b}
                onChange={(e) => handlers.handleRgbChange("b", e.target.value)}
                type="number"
                size="small"
                inputProps={{ min: 0, max: 255 }}
              />
              <TextField
                className="color-input component-input"
                label="A"
                value={state.alphaInput}
                onChange={(e) => handlers.handleAlphaChange(e.target.value)}
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
              value={state.hslInputs.h}
              onChange={(e) => handlers.handleHslChange("h", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 360 }}
            />
            <TextField
              className="color-input component-input"
              label="S"
              value={state.hslInputs.s}
              onChange={(e) => handlers.handleHslChange("s", e.target.value)}
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
              value={state.hslInputs.l}
              onChange={(e) => handlers.handleHslChange("l", e.target.value)}
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
              value={state.alphaInput}
              onChange={(e) => handlers.handleAlphaChange(e.target.value)}
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
              value={state.hsbInputs.h}
              onChange={(e) => handlers.handleHsbChange("h", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 360 }}
            />
            <TextField
              className="color-input component-input"
              label="S"
              value={state.hsbInputs.s}
              onChange={(e) => handlers.handleHsbChange("s", e.target.value)}
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
              value={state.hsbInputs.b}
              onChange={(e) => handlers.handleHsbChange("b", e.target.value)}
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
              value={state.alphaInput}
              onChange={(e) => handlers.handleAlphaChange(e.target.value)}
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
              value={state.cmykInputs.c}
              onChange={(e) => handlers.handleCmykChange("c", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="M"
              value={state.cmykInputs.m}
              onChange={(e) => handlers.handleCmykChange("m", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="Y"
              value={state.cmykInputs.y}
              onChange={(e) => handlers.handleCmykChange("y", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="K"
              value={state.cmykInputs.k}
              onChange={(e) => handlers.handleCmykChange("k", e.target.value)}
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
              value={state.labInputs.l}
              onChange={(e) => handlers.handleLabChange("l", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: 0, max: 100 }}
            />
            <TextField
              className="color-input component-input"
              label="a"
              value={state.labInputs.a}
              onChange={(e) => handlers.handleLabChange("a", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: -128, max: 127 }}
            />
            <TextField
              className="color-input component-input"
              label="b"
              value={state.labInputs.b}
              onChange={(e) => handlers.handleLabChange("b", e.target.value)}
              type="number"
              size="small"
              inputProps={{ min: -128, max: 127 }}
            />
            <TextField
              className="color-input component-input"
              label="A"
              value={state.alphaInput}
              onChange={(e) => handlers.handleAlphaChange(e.target.value)}
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

export default ColorInputs;
