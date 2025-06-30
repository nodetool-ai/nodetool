import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { LightMode, DarkMode } from "@mui/icons-material";

export const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = () => {
    setMode(mode === "dark" ? "light" : "dark");
  };

  // Don't render until we have the mode
  if (!mode) return null;

  return (
    <Tooltip title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        size="small"
        sx={{
          color: "var(--palette-text-primary)"
        }}
      >
        {mode === "dark" ? <LightMode /> : <DarkMode />}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeToggle;
