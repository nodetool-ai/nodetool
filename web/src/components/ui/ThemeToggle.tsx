import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { LightMode, DarkMode } from "@mui/icons-material";

export const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = () => {
    console.log(
      "Current mode:",
      mode,
      "Switching to:",
      mode === "dark" ? "light" : "dark"
    );
    setMode(mode === "dark" ? "light" : "dark");
  };

  // Don't render until we have the mode
  if (!mode) {
    console.log("ThemeToggle: mode is not available yet");
    return null;
  }

  console.log("ThemeToggle: current mode is", mode);

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
