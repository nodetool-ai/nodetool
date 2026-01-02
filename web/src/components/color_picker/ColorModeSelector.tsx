/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tabs, Tab } from "@mui/material";
import { ColorMode } from "./ColorInputs";

const styles = (theme: Theme) =>
  css({
    "&": {
      minHeight: "36px"
    },
    ".MuiTab-root": {
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
    },
    ".MuiTabs-indicator": {
      height: "2px",
      backgroundColor: theme.vars.palette.primary.main
    }
  });

interface ColorModeSelectorProps {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
  showAllModes?: boolean;
}

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
      css={styles(theme)}
      value={mode}
      onChange={handleChange}
      variant="scrollable"
      scrollButtons="auto"
    >
      {modes.map((m) => (
        <Tab key={m} value={m} label={m} />
      ))}
    </Tabs>
  );
};

export default ColorModeSelector;
