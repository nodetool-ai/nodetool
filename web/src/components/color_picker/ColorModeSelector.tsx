/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import { Tabs, Tab } from "@mui/material";
import { ColorMode } from "./ColorInputs";

interface ColorModeSelectorProps {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
  showAllModes?: boolean;
}

/**
 * ColorModeSelector
 * 
 * A tab selector for choosing color input modes (hex, rgb, hsl, etc.).
 * Uses semantic sx prop styling instead of CSS class selectors.
 */
const ColorModeSelector: React.FC<ColorModeSelectorProps> = ({
  mode,
  onChange,
  showAllModes = true
}) => {
  const theme = useTheme();

  const handleChange = (_: React.SyntheticEvent, newValue: ColorMode) => {
    onChange(newValue);
  };

  const modes: ColorMode[] = showAllModes
    ? ["hex", "rgb", "hsl", "hsb", "cmyk", "lab"]
    : ["hex", "rgb", "hsl"];

  return (
    <Tabs
      value={mode}
      onChange={handleChange}
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        minHeight: "36px",
        // Indicator styling
        "& .MuiTabs-indicator": {
          height: "2px",
          backgroundColor: theme.vars.palette.primary.main
        }
      }}
      TabIndicatorProps={{
        sx: {
          height: "2px",
          backgroundColor: theme.vars.palette.primary.main
        }
      }}
    >
      {modes.map((m) => (
        <Tab
          key={m}
          value={m}
          label={m}
          sx={{
            minWidth: "auto",
            minHeight: "36px",
            padding: "6px 12px",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            color: theme.vars.palette.grey[400],
            "&.Mui-selected": {
              color: theme.vars.palette.primary.main
            }
          }}
        />
      ))}
    </Tabs>
  );
};

export default ColorModeSelector;
