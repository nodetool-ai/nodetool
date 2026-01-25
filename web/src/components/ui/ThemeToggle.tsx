import React from "react";
import { StateIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import { LightMode, DarkMode } from "@mui/icons-material";

export const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = () => {
    const newMode = mode === "dark" ? "light" : "dark";
    setMode(newMode);
  };

  // Don't render until we have the mode
  if (!mode) {return null;}

  return (
    <StateIconButton
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      onClick={toggleTheme}
      size="small"
      color="inherit"
      sx={{
        color: "var(--palette-text-primary)"
      }}
    />
  );
};

export default ThemeToggle;
