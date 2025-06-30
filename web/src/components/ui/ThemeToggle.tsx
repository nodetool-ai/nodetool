import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { LightMode, DarkMode } from "@mui/icons-material";

export const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = () => {
    const newMode = mode === "dark" ? "light" : "dark";
    console.log(`Switching from ${mode} to ${newMode}`);

    // Check CSS variables after toggle
    setTimeout(() => {
      const grey900 = getComputedStyle(
        document.documentElement
      ).getPropertyValue("--palette-grey-900");
      const bg = getComputedStyle(document.documentElement).getPropertyValue(
        "--palette-background-default"
      );
      console.log(`After toggle - grey-900: ${grey900}, bg: ${bg}`);
    }, 100);

    setMode(newMode);
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
